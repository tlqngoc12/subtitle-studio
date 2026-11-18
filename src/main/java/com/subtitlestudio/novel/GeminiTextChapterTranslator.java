package com.subtitlestudio.novel;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import com.google.genai.types.Type;
import com.subtitlestudio.config.GeminiSettings;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.translate.TranslationFailedException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * One Gemini request for the original text of a Wattpad chapter (or one part of it): text in, {@code {"text": "..."}}
 * out. Uses the same {@link GeminiCaller} as the screenshot translator (model list, fallback on 503/429, reporting).
 */
@Component
public class GeminiTextChapterTranslator implements TextChapterTranslator {

    /** Fewer paragraphs than this share of the original means the answer dropped part of the chapter. */
    static final double MIN_PARAGRAPH_SHARE = 0.4;

    /** Vietnamese comes out 1.04-1.23 times as long as English or Thai; below this share the answer lost text. */
    static final double MIN_LENGTH_RATIO = 0.7;

    private static final String SENTENCE_END = ".!?…\"”’')»";

    static final String SYSTEM_RULES = """
            Bạn là người dịch tiểu thuyết sang tiếng Việt.
            - Bạn nhận văn bản gốc của một chương truyện (%s) dưới dạng chữ, các đoạn cách nhau bằng một dòng trống. \
            Dịch toàn bộ sang tiếng Việt văn xuôi tự nhiên, giàu cảm xúc, đúng giọng nhân vật.
            - "text" là BẢN DỊCH TIẾNG VIỆT của cả văn bản, dịch đủ mọi câu, không bỏ sót, không tóm tắt, không thêm \
            lời bình hay chú thích.
            - Giữ ngắt đoạn của bản gốc: mỗi đoạn gốc thành một đoạn dịch, cách nhau một dòng trống. Dòng ngăn cảnh \
            (như ***, * * *, ---) giữ nguyên thành một đoạn riêng.
            - Hội thoại giữ dấu ngoặc kép; dòng xuống hàng trong một đoạn giữ nguyên.
            %s- Hồ sơ dịch bên dưới được ưu tiên về tên riêng, thuật ngữ và cách xưng hô.
            - Nếu có mục "Đoạn ngay trước", đó là phần đã dịch ngay trước văn bản này trong cùng chương: dịch tiếp \
            cho liền mạch, KHÔNG dịch lại và không lặp lại phần đó.
            - Chỉ trả về JSON theo schema, không giải thích.""";

    private static final String THAI_RULE = """
            - Không để sót chữ Thái nào: thán từ, tiếng đáp (ค่ะ, คะ, อื้ม...) và cách gọi (คุณ...) cũng dịch sang \
            tiếng Việt, không kèm chữ gốc trong ngoặc.
            """;

    /** Only added to the rules when the request carries images, so a chapter without images asks exactly as before. */
    static final String IMAGE_RULES = """
            - Văn bản có các dòng ảnh dạng [[image:N]] (mỗi dòng là một đoạn riêng). Ảnh tương ứng được đính kèm ngay \
            sau văn bản, mỗi ảnh có nhãn "Ảnh [[image:N]]:". Chép NGUYÊN VẸN từng dòng [[image:N]] vào đúng vị trí cũ, \
            không đổi số, không bỏ, không thêm, không gộp vào đoạn khác.
            - Nếu ảnh có chữ thuộc nội dung truyện (mô tả nhân vật, tin nhắn, thư từ... chứ không phải logo hay tên \
            cuốn sách), dịch chữ đó sang tiếng Việt và đặt NGAY SAU dòng [[image:N]] của ảnh đó, thành một hoặc \
            nhiều đoạn.
            - Ảnh không có chữ như vậy thì không thêm gì sau dòng [[image:N]].
            """;

    private static final Logger log = LoggerFactory.getLogger(GeminiTextChapterTranslator.class);

    private record Answer(String text) {}

    private final GeminiCaller caller;
    private final GeminiSettings settings;
    private final ObjectMapper mapper;

    @Autowired
    public GeminiTextChapterTranslator(GeminiCaller caller, GeminiSettings settings, ObjectMapper mapper) {
        this.caller = caller;
        this.settings = settings;
        this.mapper = mapper;
    }

    GeminiTextChapterTranslator(GeminiCaller caller, SubtitleStudioProperties.Gemini settings, ObjectMapper mapper) {
        this.caller = caller;
        this.settings = GeminiSettings.fixed(settings);
        this.mapper = mapper;
    }

    @Override
    public TextAnswer translate(TextChapterPrompt prompt, Consumer<String> onTrying) {
        List<Part> parts = new ArrayList<>();
        parts.add(Part.fromText(context(prompt)));
        parts.add(Part.fromText(prompt.sourceText()));
        for (PromptImage image : prompt.images()) {
            parts.add(Part.fromText("Ảnh " + ImageMarkers.marker(image.mediaId()) + ":"));
            parts.add(Part.fromBytes(image.bytes(), image.mimeType()));
        }
        GeminiCaller.Answer answer = caller.generate(parts, config(prompt), onTrying, true);
        if (answer.truncated()) {
            log.warn("Gemini {} stopped at its output limit for chapter {} ({} source chars)", answer.model(),
                    prompt.chapterNo(), prompt.sourceText().length());
            throw new TextIncompleteException("Gemini's answer was cut off.");
        }
        Answer got;
        try {
            got = mapper.readValue(answer.text(), Answer.class);
        } catch (JsonProcessingException e) {
            log.warn("Gemini {} answer for chapter {} is not the expected JSON ({} chars)", answer.model(),
                    prompt.chapterNo(), answer.text().length());
            throw new TextIncompleteException("Gemini's answer was cut off.");
        }
        String text = got == null || got.text() == null ? "" : got.text().strip();
        if (!ImageMarkers.ids(text).equals(ImageMarkers.ids(prompt.sourceText()))) {
            int expected = ImageMarkers.ids(prompt.sourceText()).size();
            int found = ImageMarkers.ids(text).size();
            text = ImageMarkers.restore(prompt.sourceText(), text).orElseThrow(() -> {
                log.warn("Gemini {} answer for chapter {} lost or changed an image marker ({} markers expected, "
                        + "could not restore them)", answer.model(), prompt.chapterNo(), expected);
                return new TranslationFailedException(
                        "Gemini (" + answer.model() + ") dropped this chapter's images. Try again later.");
            });
            log.warn("Gemini {} answer for chapter {} lost or moved image markers ({} expected, {} found); "
                    + "restored them by paragraph position", answer.model(), prompt.chapterNo(), expected, found);
        }
        // Marker paragraphs are not text: only the rest of the original is compared with the rest of the answer, and
        // a chapter of images alone has nothing to compare.
        String source = ImageMarkers.strip(prompt.sourceText());
        String translated = ImageMarkers.strip(text);
        if (source.isBlank()) {
            log.info("Gemini {} translated chapter {} (images only, {} chars)", answer.model(), prompt.chapterNo(),
                    text.length());
            return new TextAnswer(text, answer.model());
        }
        int sourceParagraphs = TextSplitter.paragraphs(source).size();
        int answerParagraphs = TextSplitter.paragraphs(translated).size();
        if (answerParagraphs < Math.ceil(sourceParagraphs * MIN_PARAGRAPH_SHARE)) {
            log.warn("Gemini {} answered {} paragraphs for {} in chapter {}", answer.model(), answerParagraphs,
                    sourceParagraphs, prompt.chapterNo());
            throw new TextIncompleteException("Gemini's answer is much shorter than the original.");
        }
        int sourceChars = source.length();
        if (sourceChars > 0 && (double) translated.length() / sourceChars < MIN_LENGTH_RATIO) {
            log.warn("Gemini {} answered {} chars for {} source chars in chapter {} (length ratio check)",
                    answer.model(), translated.length(), sourceChars, prompt.chapterNo());
            throw new TextIncompleteException("Gemini's answer is much shorter than the original.");
        }
        // The text after a final image is the translation of that image: it has no original to compare with.
        if (!endsWithMarker(prompt.sourceText()) && endsMidSentence(source, translated)) {
            log.warn("Gemini {} answer for chapter {} stops mid-sentence (ending check, {} to {} chars)",
                    answer.model(), prompt.chapterNo(), sourceChars, translated.length());
            throw new TextIncompleteException("Gemini's answer stops mid-sentence.");
        }
        log.info("Gemini {} translated chapter {} ({} chars to {})", answer.model(), prompt.chapterNo(),
                prompt.sourceText().length(), text.length());
        return new TextAnswer(text, answer.model());
    }

    /**
     * True when the original's last paragraph ends with sentence-final punctuation but the translation's last paragraph
     * does not, i.e. the answer was cut off mid-sentence. Sources ending otherwise ({@code ***}, {@code ~}) are skipped.
     */
    static boolean endsMidSentence(String source, String translated) {
        return endsSentence(lastParagraph(source)) && !endsSentence(lastParagraph(translated));
    }

    private static boolean endsWithMarker(String text) {
        List<String> paragraphs = TextSplitter.paragraphs(text);
        return !paragraphs.isEmpty() && ImageMarkers.mediaId(paragraphs.getLast()).isPresent();
    }

    private static String lastParagraph(String text) {
        List<String> paragraphs = TextSplitter.paragraphs(text);
        return paragraphs.isEmpty() ? "" : paragraphs.getLast();
    }

    private static boolean endsSentence(String paragraph) {
        String s = paragraph.stripTrailing();
        return !s.isEmpty() && SENTENCE_END.indexOf(s.charAt(s.length() - 1)) >= 0;
    }

    private static String context(TextChapterPrompt p) {
        StringBuilder sb = new StringBuilder();
        sb.append("# Hồ sơ dịch\n").append(p.profile()).append("\n\n");
        if (p.previousText() != null) {
            sb.append("# Chương trước (bản dịch)\n").append(p.previousText()).append("\n\n");
        }
        if (p.carrySource() != null && p.carryTranslation() != null) {
            sb.append("# Đoạn ngay trước (để giữ mạch, KHÔNG dịch lại)\n")
                    .append("Cuối phần gốc đã dịch:\n").append(p.carrySource()).append("\n\n")
                    .append("Cuối bản dịch của phần đó:\n").append(p.carryTranslation()).append("\n\n");
        }
        sb.append("# ").append(p.chapterName()).append(": ").append(p.novelTitle()).append('\n')
                .append("Văn bản gốc cần dịch ở ngay dưới.");
        return sb.toString();
    }

    private GenerateContentConfig config(TextChapterPrompt p) {
        Schema root = Schema.builder()
                .type(Type.Known.OBJECT)
                .properties(Map.of("text", Schema.builder().type(Type.Known.STRING).build()))
                .required("text")
                .build();
        String rules = String.format(java.util.Locale.ROOT, SYSTEM_RULES, p.languageName(),
                ("th".equals(p.sourceLanguage()) ? THAI_RULE : "") + (p.images().isEmpty() ? "" : IMAGE_RULES));
        GenerateContentConfig.Builder config = GenerateContentConfig.builder()
                .systemInstruction(Content.fromParts(Part.fromText(rules)))
                .responseMimeType("application/json")
                .responseSchema(root)
                .temperature((float) settings.current().temperature());
        if (settings.current().translationThinking() != null) {
            config.thinkingConfig(settings.current().translationThinking());
        }
        return config.build();
    }
}
