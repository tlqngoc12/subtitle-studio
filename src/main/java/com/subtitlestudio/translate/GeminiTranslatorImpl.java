package com.subtitlestudio.translate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.GeminiSettings;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import com.google.genai.types.Type;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Gemini translation (via {@link GeminiCaller}): one request per call (plus up to two follow-ups for lines it left out), structured JSON output
 * ({@code [{id, src, text}]}), and no automatic retries so a quota error does not burn more of the free tier.
 */
@Component
public class GeminiTranslatorImpl implements GeminiTranslator {

    static final String SYSTEM_RULES = """
            Bạn là người dịch phụ đề video sang tiếng Việt.
            - Dịch tự nhiên, đúng văn phong phụ đề: ngắn gọn, dễ đọc khi xem video, không dịch từng chữ.
            - Đầu vào là mảng các block phụ đề, mỗi block có id và text. Với mỗi id đầu vào trả đúng một phần tử cùng id; \
            không thêm, bớt, gộp hay tách block.
            - Mỗi phần tử có thêm "src": chép y nguyên 3 từ đầu tiên trong text tiếng Anh của block đó (chỉ để đối chiếu, không dịch).
            - Giữ nguyên các dấu xuống dòng (\\n) và gạch đầu dòng hội thoại ("- ") trong mỗi block.
            - Một câu bị cắt qua nhiều block thì dịch sao cho mỗi block khớp với phần lời nói của nó.
            - Hồ sơ dịch (bối cảnh, nhân vật, xưng hô, tên riêng) bên dưới được ưu tiên khi có mâu thuẫn.
            - Phần ví dụ đã duyệt (nếu có) là chuẩn về tên riêng, xưng hô và giọng văn; chỉ tham khảo, không dịch lại phần ví dụ.
            - Phần "Đoạn ngay trước" (nếu có) là những dòng cuối của đoạn đã dịch ngay trước phần này; chỉ để giữ mạch \
            và nhất quán cách xưng hô, không dịch lại và không trả về các dòng đó.
            - Mô tả video (nếu có) chỉ để hiểu bối cảnh và tên nhân vật; không dịch mô tả.
            - Chỉ trả về JSON theo schema, không giải thích.""";

    /** Extra requests for lines Gemini left out; a call makes at most {@code 1 + MAX_FOLLOW_UPS} requests. */
    static final int MAX_FOLLOW_UPS = 2;

    private static final Logger log = LoggerFactory.getLogger(GeminiTranslatorImpl.class);
    private static final TypeReference<List<AnswerLine>> LINES = new TypeReference<>() {};

    private final GeminiSettings settings;
    private final ObjectMapper mapper;
    private final GeminiCaller caller;

    @Autowired
    public GeminiTranslatorImpl(GeminiSettings settings, ObjectMapper mapper, GeminiCaller caller) {
        this.settings = settings;
        this.mapper = mapper;
        this.caller = caller;
    }

    /** {@code baseUrl} points the SDK at a fake server in tests; null means the real Gemini API. */
    GeminiTranslatorImpl(SubtitleStudioProperties.Gemini settings, ObjectMapper mapper, String baseUrl) {
        this.settings = GeminiSettings.fixed(settings);
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
        Map<Integer, TranslatedLine> valid = new HashMap<>();
        List<SourceLine> missing = lines;
        String answeredBy = "";
        for (int attempt = 0; attempt <= MAX_FOLLOW_UPS && !missing.isEmpty(); attempt++) {
            VideoContext context = attempt == 0 ? video : followUpContext(video, lines, valid, missing.get(0));
            GeminiCaller.Answer answer = caller.generate(
                    List.of(Part.fromText(userContent(context, profile, missing))), config(), onTrying);
            List<AnswerLine> got = parse(answer, missing.size());
            TranslationOutput.Checked checked = TranslationOutput.checkAnswer(missing, got);
            checked.valid().forEach(line -> valid.put(line.id(), line));
            if (checked.extra() > 0) {
                log.info("Gemini {} returned {} ids that were not sent; ignored", answer.model(), checked.extra());
            }
            if (attempt > 0) {
                log.info("Gemini {} follow-up {}/{}: asked {} lines, {} valid", answer.model(), attempt, MAX_FOLLOW_UPS,
                        missing.size(), checked.valid().size());
            }
            answeredBy = answer.model();
            if (!checked.missing().isEmpty()) {
                // Answers vary between runs, so a rejected one is only diagnosable from this line (no subtitle text in it).
                log.warn("Gemini {} returned an invalid answer: {}", answeredBy, TranslationOutput.describeAnswer(missing, got));
            }
            missing = checked.missing();
        }
        if (!missing.isEmpty()) {
            throw TranslationOutput.invalid(valid.size(), lines.size());
        }
        log.info("Gemini {} translated {} lines", answeredBy, lines.size());
        return lines.stream().map(line -> valid.get(line.id())).toList();
    }

    /** The answer's lines; an answer that is not the expected JSON counts as having no valid line. */
    private List<AnswerLine> parse(GeminiCaller.Answer answer, int asked) {
        try {
            return mapper.readValue(answer.text(), LINES);
        } catch (JsonProcessingException e) {
            log.warn("Gemini {} answer for {} lines is not the expected JSON ({} chars)", answer.model(), asked,
                    answer.text().length());
            return List.of();
        }
    }

    /**
     * Context for a follow-up: up to {@link TranslationService#CONTEXT_LINES} lines already translated right before
     * the first missing one; when nothing precedes it, the caller's own previous lines.
     */
    private static VideoContext followUpContext(VideoContext video, List<SourceLine> lines,
                                                Map<Integer, TranslatedLine> valid, SourceLine firstMissing) {
        int at = lines.indexOf(firstMissing);
        List<ExamplePair> before = new ArrayList<>();
        for (int i = at - 1; i >= 0 && before.size() < TranslationService.CONTEXT_LINES; i--) {
            TranslatedLine done = valid.get(lines.get(i).id());
            if (done == null) {
                break;
            }
            before.add(0, new ExamplePair(lines.get(i).text(), done.text()));
        }
        if (before.isEmpty()) {
            return video;
        }
        return new VideoContext(video.title(), video.channel(), video.description(), video.examples(), before);
    }

    private GenerateContentConfig config() {
        var gemini = settings.current();
        Schema line = Schema.builder()
                .type(Type.Known.OBJECT)
                .properties(Map.of(
                        "id", Schema.builder().type(Type.Known.INTEGER).build(),
                        "src", Schema.builder().type(Type.Known.STRING).build(),
                        "text", Schema.builder().type(Type.Known.STRING).build()))
                .required("id", "src", "text")
                .propertyOrdering("id", "src", "text")
                .build();
        GenerateContentConfig.Builder config = GenerateContentConfig.builder()
                .systemInstruction(Content.fromParts(Part.fromText(SYSTEM_RULES)))
                .responseMimeType("application/json")
                .responseSchema(Schema.builder().type(Type.Known.ARRAY).items(line).build())
                .temperature((float) gemini.temperature());
        if (gemini.translationThinking() != null) {
            config.thinkingConfig(gemini.translationThinking());
        }
        return config.build();
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
            String previous = video.previousLines().isEmpty() ? ""
                    : "# Đoạn ngay trước (để giữ mạch, KHÔNG dịch lại)\n"
                    + mapper.writeValueAsString(video.previousLines()) + "\n\n";
            return "# Hồ sơ dịch\n" + profile + "\n\n" + examples + previous
                    + "# Phụ đề cần dịch (JSON)\n" + mapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
