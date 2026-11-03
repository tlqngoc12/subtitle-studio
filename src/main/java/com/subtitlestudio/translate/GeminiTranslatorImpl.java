package com.subtitlestudio.translate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.google.genai.Client;
import com.google.genai.errors.ApiException;
import com.google.genai.errors.GenAiIOException;
import com.google.genai.types.Content;
import com.google.genai.types.FinishReason;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.HttpOptions;
import com.google.genai.types.HttpRetryOptions;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import com.google.genai.types.Type;
import java.io.InterruptedIOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Gemini translation with the official SDK: one request per video, structured JSON output
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
            - Chỉ trả về JSON theo schema, không giải thích.""";

    private static final Logger log = LoggerFactory.getLogger(GeminiTranslatorImpl.class);
    private static final TypeReference<List<TranslatedLine>> LINES = new TypeReference<>() {};

    private final SubtitleStudioProperties.Gemini settings;
    private final ObjectMapper mapper;
    private final String baseUrl;

    @Autowired
    public GeminiTranslatorImpl(SubtitleStudioProperties properties, ObjectMapper mapper) {
        this(properties.gemini(), mapper, null);
    }

    /** {@code baseUrl} points the SDK at a fake server in tests; null means the real Gemini API. */
    GeminiTranslatorImpl(SubtitleStudioProperties.Gemini settings, ObjectMapper mapper, String baseUrl) {
        this.settings = settings;
        this.mapper = mapper;
        this.baseUrl = baseUrl;
    }

    @Override
    public List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines) {
        GenerateContentResponse response;
        try (Client client = client()) {
            response = client.models.generateContent(settings.model(), userContent(video, profile, lines), config());
        } catch (ApiException e) {
            throw fromApi(e);
        } catch (GenAiIOException e) {
            throw causedByTimeout(e)
                    ? new TranslationFailedException("Gemini did not respond in time.")
                    : new TranslationFailedException("Could not translate: connection to Gemini failed.");
        }

        String text = textOrNull(response);
        if (text == null || text.isBlank()) {
            throw new TranslationFailedException("Gemini refused to translate this content.");
        }
        try {
            return TranslationOutput.validate(lines, mapper.readValue(text, LINES));
        } catch (JsonProcessingException e) {
            throw TranslationOutput.invalid(0, lines.size());
        }
    }

    private Client client() {
        HttpOptions.Builder http = HttpOptions.builder()
                .timeout((int) settings.timeout().toMillis())
                .retryOptions(HttpRetryOptions.builder().attempts(1));
        if (baseUrl != null) {
            http.baseUrl(baseUrl);
        }
        return Client.builder().apiKey(settings.apiKey()).httpOptions(http.build()).build();
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
        data.put("lines", lines);
        try {
            return "# Hồ sơ dịch\n" + profile + "\n\n# Phụ đề cần dịch (JSON)\n" + mapper.writeValueAsString(data);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private TranslationFailedException fromApi(ApiException e) {
        return switch (e.code()) {
            case 429 -> new TranslationFailedException("Gemini free quota is used up, try again later.");
            case 401, 403 -> new TranslationFailedException("GEMINI_API_KEY is not valid.");
            default -> {
                // Error text from the API may echo request details; keep it out of the message and the log.
                log.warn("Gemini request failed with HTTP {}", e.code());
                yield new TranslationFailedException("Could not translate: Gemini returned error " + e.code() + ".");
            }
        };
    }

    /** The answer text, or null when Gemini stopped for another reason than STOP (blocked, truncated...). */
    private static String textOrNull(GenerateContentResponse response) {
        FinishReason reason = response.finishReason();
        if (reason != null && reason.knownEnum() != FinishReason.Known.STOP) {
            return null;
        }
        try {
            return response.text();
        } catch (RuntimeException e) {
            return null; // the SDK throws when the candidate has no content parts
        }
    }

    private static boolean causedByTimeout(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof InterruptedIOException) {
                return true;
            }
        }
        return false;
    }
}
