package com.subtitlestudio.translate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import com.google.genai.types.Type;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Gemini translation (via {@link GeminiCaller}): one request per video, structured JSON output
 * ({@code [{id, text}]}), and no automatic retries so a quota error does not burn more of the free tier.
 */
@Component
public class GeminiTranslatorImpl implements GeminiTranslator {

    static final String SYSTEM_RULES = """
            Bạn là người dịch phụ đề video sang tiếng Việt.
            - Dịch tự nhiên, đúng văn phong phụ đề: ngắn gọn, dễ đọc khi xem video, không dịch từng chữ.
            - Đầu vào là mảng các block phụ đề, mỗi block có id và text. Với mỗi id đầu vào trả đúng một phần tử cùng id; \
            không thêm, bớt, gộp hay tách block.
            - Giữ nguyên các dấu xuống dòng (\\n) và gạch đầu dòng hội thoại ("- ") trong mỗi block.
            - Một câu bị cắt qua nhiều block thì dịch sao cho mỗi block khớp với phần lời nói của nó.
            - Hồ sơ dịch (bối cảnh, nhân vật, xưng hô, tên riêng) bên dưới được ưu tiên khi có mâu thuẫn.
            - Phần ví dụ đã duyệt (nếu có) là chuẩn về tên riêng, xưng hô và giọng văn; chỉ tham khảo, không dịch lại phần ví dụ.
            - Mô tả video (nếu có) chỉ để hiểu bối cảnh và tên nhân vật; không dịch mô tả.
            - Chỉ trả về JSON theo schema, không giải thích.""";

    private static final Logger log = LoggerFactory.getLogger(GeminiTranslatorImpl.class);
    private static final TypeReference<List<TranslatedLine>> LINES = new TypeReference<>() {};

    private final SubtitleStudioProperties.Gemini settings;
    private final ObjectMapper mapper;
    private final GeminiCaller caller;

    @Autowired
    public GeminiTranslatorImpl(SubtitleStudioProperties properties, ObjectMapper mapper, GeminiCaller caller) {
        this.settings = properties.gemini();
        this.mapper = mapper;
        this.caller = caller;
    }

    /** {@code baseUrl} points the SDK at a fake server in tests; null means the real Gemini API. */
    GeminiTranslatorImpl(SubtitleStudioProperties.Gemini settings, ObjectMapper mapper, String baseUrl) {
        this.settings = settings;
        this.mapper = mapper;
        this.caller = new GeminiCaller(settings, baseUrl);
    }

    @Override
    public List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines) {
        return translate(video, profile, lines, model -> {});
    }

    @Override
    public List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines,
                                          java.util.function.Consumer<String> onTrying) {
        GeminiCaller.Answer answer = caller.generate(List.of(Part.fromText(userContent(video, profile, lines))),
                config(), onTrying);
        String answeredBy = answer.model();
        List<TranslatedLine> got;
        try {
            got = mapper.readValue(answer.text(), LINES);
        } catch (JsonProcessingException e) {
            log.warn("Gemini {} answer for {} lines is not the expected JSON ({} chars)", answeredBy, lines.size(),
                    answer.text().length());
            throw TranslationOutput.invalid(0, lines.size());
        }
        // Answers vary between runs, so a rejected one is only diagnosable from this line (no subtitle text in it).
        try {
            List<TranslatedLine> valid = TranslationOutput.validate(lines, got);
            log.info("Gemini {} translated {} lines", answeredBy, lines.size());
            return valid;
        } catch (TranslationFailedException e) {
            log.warn("Gemini {} returned an invalid answer: {}", answeredBy, TranslationOutput.describe(lines, got));
            throw e;
        }
    }

    private GenerateContentConfig config() {
        Schema line = Schema.builder()
                .type(Type.Known.OBJECT)
                .properties(Map.of(
                        "id", Schema.builder().type(Type.Known.INTEGER).build(),
                        "text", Schema.builder().type(Type.Known.STRING).build()))
                .required("id", "text")
                .build();
        return GenerateContentConfig.builder()
                .systemInstruction(Content.fromParts(Part.fromText(SYSTEM_RULES)))
                .responseMimeType("application/json")
                .responseSchema(Schema.builder().type(Type.Known.ARRAY).items(line).build())
                .temperature((float) settings.temperature())
                .build();
    }

    private String userContent(VideoContext video, String profile, List<SourceLine> lines) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("title", video.title());
        data.put("channel", video.channel());
        if (video.description() != null) {
            data.put("description", video.description());
        }
        data.put("lines", lines);
        try {
            String examples = video.examples().isEmpty() ? ""
                    : "# Ví dụ đã được người dịch duyệt (cùng bộ phim; bắt chước tên riêng, xưng hô và giọng văn)\n"
                    + mapper.writeValueAsString(video.examples()) + "\n\n";
            return "# Hồ sơ dịch\n" + profile + "\n\n" + examples
                    + "# Phụ đề cần dịch (JSON)\n" + mapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
