package com.subtitlestudio.novel;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import com.google.genai.types.Type;
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

    static final String SYSTEM_RULES = """
            Bạn là người dịch tiểu thuyết sang tiếng Việt.
            - Bạn nhận văn bản gốc của một chương truyện (%s) dưới dạng chữ, các đoạn cách nhau bằng một dòng trống. \
            Dịch toàn bộ sang tiếng Việt văn xuôi tự nhiên, giàu cảm xúc, đúng giọng nhân vật.
            - "text" là BẢN DỊCH TIẾNG VIỆT của cả văn bản, dịch đủ mọi câu, không bỏ sót, không tóm tắt, không thêm \
            lời bình hay chú thích.
            - Giữ ngắt đoạn của bản gốc: mỗi đoạn gốc thành một đoạn dịch, cách nhau một dòng trống. Dòng ngăn cảnh \
            (như ***, * * *, ---) giữ nguyên thành một đoạn riêng.
            - Hội thoại giữ dấu ngoặc kép; dòng xuống hàng trong một đoạn giữ nguyên.
            %s- Hồ sơ dịch và sổ tay truyện bên dưới được ưu tiên về tên riêng, thuật ngữ và cách xưng hô.
            - Nếu có mục "Đoạn ngay trước", đó là phần đã dịch ngay trước văn bản này trong cùng chương: dịch tiếp \
            cho liền mạch, KHÔNG dịch lại và không lặp lại phần đó.
            - Chỉ trả về JSON theo schema, không giải thích.""";

    private static final String THAI_RULE = """
            - Không để sót chữ Thái nào: thán từ, tiếng đáp (ค่ะ, คะ, อื้ม...) và cách gọi (คุณ...) cũng dịch sang \
            tiếng Việt, không kèm chữ gốc trong ngoặc.
            """;

    private static final Logger log = LoggerFactory.getLogger(GeminiTextChapterTranslator.class);

    private record Answer(String text) {}

    private final GeminiCaller caller;
    private final SubtitleStudioProperties.Gemini settings;
    private final ObjectMapper mapper;

    @Autowired
    public GeminiTextChapterTranslator(GeminiCaller caller, SubtitleStudioProperties properties, ObjectMapper mapper) {
        this(caller, properties.gemini(), mapper);
    }

    GeminiTextChapterTranslator(GeminiCaller caller, SubtitleStudioProperties.Gemini settings, ObjectMapper mapper) {
        this.caller = caller;
        this.settings = settings;
        this.mapper = mapper;
    }

    @Override
    public TextAnswer translate(TextChapterPrompt prompt, Consumer<String> onTrying) {
        List<Part> parts = new ArrayList<>();
        parts.add(Part.fromText(context(prompt)));
        parts.add(Part.fromText(prompt.sourceText()));
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
        int sourceParagraphs = TextSplitter.paragraphs(prompt.sourceText()).size();
        int answerParagraphs = TextSplitter.paragraphs(text).size();
        if (answerParagraphs < Math.ceil(sourceParagraphs * MIN_PARAGRAPH_SHARE)) {
            log.warn("Gemini {} answered {} paragraphs for {} in chapter {}", answer.model(), answerParagraphs,
                    sourceParagraphs, prompt.chapterNo());
            throw new TextIncompleteException("Gemini's answer is much shorter than the original.");
        }
        log.info("Gemini {} translated chapter {} ({} chars to {})", answer.model(), prompt.chapterNo(),
                prompt.sourceText().length(), text.length());
        return new TextAnswer(text, answer.model());
    }

    private static String context(TextChapterPrompt p) {
        StringBuilder sb = new StringBuilder();
        sb.append("# Hồ sơ dịch\n").append(p.profile()).append("\n\n");
        if (p.notebookText() != null) {
            sb.append("# Sổ tay truyện\n").append(p.notebookText()).append("\n\n");
        }
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
                "th".equals(p.sourceLanguage()) ? THAI_RULE : "");
        return GenerateContentConfig.builder()
                .systemInstruction(Content.fromParts(Part.fromText(rules)))
                .responseMimeType("application/json")
                .responseSchema(root)
                .temperature((float) settings.temperature())
                .build();
    }
}
