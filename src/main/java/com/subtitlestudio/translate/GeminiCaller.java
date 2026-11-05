package com.subtitlestudio.translate;

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
import java.io.InterruptedIOException;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * One Gemini generateContent call with the official SDK: the main model, then the fallback models while each answers
 * "overloaded" (503), no automatic retries (a quota error must not burn more of the free tier). Every failure becomes
 * a {@link TranslationFailedException} whose message can be shown to the user; request and answer text never reach
 * the log.
 */
@Component
public class GeminiCaller {

    /** The answer text and the model that gave it. */
    public record Answer(String text, String model) {}

    private static final Logger log = LoggerFactory.getLogger(GeminiCaller.class);

    private final SubtitleStudioProperties.Gemini settings;
    private final String baseUrl;

    @Autowired
    public GeminiCaller(SubtitleStudioProperties properties) {
        this(properties.gemini(), null);
    }

    /** {@code baseUrl} points the SDK at a fake server in tests; null means the real Gemini API. */
    public GeminiCaller(SubtitleStudioProperties.Gemini settings, String baseUrl) {
        this.settings = settings;
        this.baseUrl = baseUrl;
    }

    public Answer generate(List<Part> parts, GenerateContentConfig config) {
        GenerateContentResponse response = null;
        String answeredBy = null;
        Content content = Content.fromParts(parts.toArray(Part[]::new));
        try (Client client = client()) {
            List<String> models = new ArrayList<>();
            models.add(settings.model());
            models.addAll(settings.fallbackModels());
            for (int i = 0; response == null; i++) {
                try {
                    response = client.models.generateContent(models.get(i), content, config);
                    answeredBy = models.get(i);
                } catch (ApiException e) {
                    if (e.code() != 503) {
                        throw fromApi(e);
                    }
                    log.warn("Gemini model {} is overloaded (HTTP 503)", models.get(i));
                    if (i == models.size() - 1) {
                        throw new TranslationFailedException(
                                "Gemini is busy right now (high demand), try again in a few minutes.");
                    }
                }
            }
        } catch (GenAiIOException e) {
            throw causedByTimeout(e)
                    ? new TranslationFailedException("Gemini did not respond in time.")
                    : new TranslationFailedException("Could not translate: connection to Gemini failed.");
        }
        String text = textOrNull(response);
        if (text == null || text.isBlank()) {
            throw new TranslationFailedException("Gemini refused to translate this content.");
        }
        return new Answer(text, answeredBy);
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
