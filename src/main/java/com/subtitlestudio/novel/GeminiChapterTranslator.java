package com.subtitlestudio.novel;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.translate.TranslationFailedException;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.MediaResolution;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import com.google.genai.types.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** One Gemini request for a batch of chapter pages: screenshots in, {@code {pages: [{page, text}]}} out. */
@Component
public class GeminiChapterTranslator implements ChapterTranslator {

    static final String SYSTEM_RULES = """
            Bạn là người dịch tiểu thuyết sang tiếng Việt.
            - Mỗi ảnh là một trang tiểu thuyết (thường là tiếng Thái), có nhãn "Page k" ngay trước ảnh. Đọc chữ trong \
            từng ảnh theo đúng thứ tự trang rồi dịch sang tiếng Việt văn xuôi tự nhiên, giàu cảm xúc, đúng giọng nhân vật.
            - "text" là BẢN DỊCH TIẾNG VIỆT của trang, không chép lại chữ Thái. Không để sót chữ Thái nào: thán từ,             tiếng đáp (ค่ะ, คะ, อื้ม...) và cách gọi (คุณ...) cũng dịch sang tiếng Việt, không kèm chữ gốc trong ngoặc.
            - Với mỗi ảnh trả đúng một phần tử có "page" bằng số k của ảnh đó; không gộp, không tách, không bỏ trang.
            - Giữ ngắt đoạn của bản gốc (một dòng trống giữa các đoạn). Không thêm lời bình, chú thích hay tóm tắt.
            - Bỏ qua chữ thuộc giao diện ứng dụng nếu có trong ảnh (thanh trạng thái, giờ, pin, nút bấm, số trang).
            - Một câu bị cắt sang trang sau thì dịch sao cho mỗi trang khớp phần lời của nó.
            - Hồ sơ dịch và sổ tay truyện bên dưới được ưu tiên về tên riêng, thuật ngữ và cách xưng hô.
            - Chỉ trả về JSON theo schema, không giải thích.""";

    private static final Logger log = LoggerFactory.getLogger(GeminiChapterTranslator.class);

    private record Answer(List<TranslatedPage> pages) {}

    private final GeminiCaller caller;
    private final SubtitleStudioProperties.Gemini settings;
    private final ObjectMapper mapper;

    @Autowired
    public GeminiChapterTranslator(GeminiCaller caller, SubtitleStudioProperties properties, ObjectMapper mapper) {
        this(caller, properties.gemini(), mapper);
    }

    GeminiChapterTranslator(GeminiCaller caller, SubtitleStudioProperties.Gemini settings, ObjectMapper mapper) {
        this.caller = caller;
        this.settings = settings;
        this.mapper = mapper;
    }

    /**
     * Sends the pages; when some come back missing (skipped, blank, wrongly numbered), asks once more for only those
     * pages and keeps the good ones from the first answer. When that second request fails or is still incomplete,
     * the pages translated so far travel in a {@link ChapterPartlyTranslatedException} so they can be saved.
     */
    @Override
    public List<TranslatedPage> translate(ChapterPrompt prompt) {
        PageTextOutput.Check first = ask(prompt, prompt.pages());
        if (first.missing().isEmpty()) {
            return first.valid();
        }
        log.warn("Chapter {}: asking again for {} {}", prompt.chapterNo(), first.missing().size(),
                first.missing().size() == 1 ? "page" : "pages");
        List<PageImage> missing = prompt.pages().stream().filter(p -> first.missing().contains(p.page())).toList();
        PageTextOutput.Check second;
        try {
            second = ask(prompt, missing);
        } catch (TranslationFailedException e) {
            throw new ChapterPartlyTranslatedException(e.userMessage(), first.valid());
        }
        List<TranslatedPage> all = new ArrayList<>(first.valid());
        all.addAll(second.valid());
        all.sort(java.util.Comparator.comparingInt(TranslatedPage::page));
        if (!second.missing().isEmpty()) {
            throw new ChapterPartlyTranslatedException(
                    PageTextOutput.incomplete(all.size(), prompt.pages().size()).userMessage(), all);
        }
        return all;
    }

    /** One request for {@code pages}; logs the model and, when pages are missing, the answer's shape (no text). */
    private PageTextOutput.Check ask(ChapterPrompt prompt, List<PageImage> pages) {
        List<Part> parts = new ArrayList<>();
        parts.add(Part.fromText(context(prompt)));
        for (PageImage page : pages) {
            parts.add(Part.fromText("Page " + page.page()));
            parts.add(Part.fromBytes(page.jpeg(), "image/jpeg"));
        }
        GeminiCaller.Answer answer = caller.generate(parts, config());
        Answer got;
        try {
            got = mapper.readValue(answer.text(), Answer.class);
        } catch (JsonProcessingException e) {
            log.warn("Gemini {} answer for {} pages is not the expected JSON ({} chars)", answer.model(),
                    pages.size(), answer.text().length());
            throw new TranslationFailedException("Gemini returned an answer that is not a translation.");
        }
        PageTextOutput.Check check = PageTextOutput.check(pages, got.pages());
        if (check.missing().isEmpty()) {
            log.info("Gemini {} translated {} pages of chapter {}", answer.model(), pages.size(),
                    prompt.chapterNo());
        } else {
            // Answers vary between runs, so a rejected one is only diagnosable from this line (no novel text in it).
            log.warn("Gemini {} returned an incomplete answer for {} pages of chapter {}: {}", answer.model(),
                    pages.size(), prompt.chapterNo(), check.description());
        }
        return check;
    }

    private static String context(ChapterPrompt p) {
        StringBuilder sb = new StringBuilder();
        sb.append("# Hồ sơ dịch\n").append(p.profile()).append("\n\n");
        if (p.notebookText() != null) {
            sb.append("# Sổ tay truyện\n").append(p.notebookText()).append("\n\n");
        }
        if (p.previousText() != null) {
            sb.append("# Chương trước (bản dịch)\n").append(p.previousText()).append("\n\n");
        }
        if (p.carryOver() != null) {
            sb.append("# Đoạn cuối lượt trước\n")
                    .append("(Đây là phần dịch ngay trước các trang dưới đây trong cùng chương; dịch tiếp cho liền mạch.)\n")
                    .append(p.carryOver()).append("\n\n");
        }
        sb.append("# Chương ").append(p.chapterNo()).append(": ").append(p.novelTitle()).append('\n')
                .append("Các trang cần dịch ở dưới, mỗi ảnh có nhãn \"Page k\" ngay trước.");
        return sb.toString();
    }

    private GenerateContentConfig config() {
        Schema page = Schema.builder()
                .type(Type.Known.OBJECT)
                .properties(Map.of(
                        "page", Schema.builder().type(Type.Known.INTEGER).build(),
                        "text", Schema.builder().type(Type.Known.STRING).build()))
                .required("page", "text")
                .build();
        Schema root = Schema.builder()
                .type(Type.Known.OBJECT)
                .properties(Map.of("pages", Schema.builder().type(Type.Known.ARRAY).items(page).build()))
                .required("pages")
                .build();
        return GenerateContentConfig.builder()
                .systemInstruction(Content.fromParts(Part.fromText(SYSTEM_RULES)))
                .responseMimeType("application/json")
                .responseSchema(root)
                .mediaResolution(MediaResolution.Known.MEDIA_RESOLUTION_HIGH)
                .temperature((float) settings.temperature())
                .build();
    }
}
