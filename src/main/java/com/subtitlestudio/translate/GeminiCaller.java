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
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * One Gemini generateContent call with the official SDK: the main model, then the fallback models while each answers
 * "overloaded" (503) or "out of quota" (429; free-tier quotas are counted per model), no automatic retries of the same
 * model. Every failure becomes a {@link TranslationFailedException} whose message can be shown to the user; request
 * and answer text never reach the log.
 */
@Component
public class GeminiCaller {

    /**
     * The answer text and the model that gave it. {@code truncated} is true only when the caller allowed it and Gemini
     * stopped at its output limit; {@code text} is then what came back so far (possibly empty).
     */
    public record Answer(String text, String model, boolean truncated) {

        public Answer(String text, String model) {
            this(text, model, false);
        }
    }

    private static final Logger log = LoggerFactory.getLogger(GeminiCaller.class);
    private static final Pattern QUOTA_METRIC = Pattern.compile("Quota exceeded for metric: ([^\\n]+)");
    private static final java.time.format.DateTimeFormatter RESET_FORMAT = java.time.format.DateTimeFormatter
            .ofPattern("HH:mm", java.util.Locale.ROOT).withZone(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
    private static final Pattern RETRY_SECONDS = Pattern.compile("retry in (\\d+(?:\\.\\d+)?)s\\b");

    private final SubtitleStudioProperties.Gemini settings;
    private final String baseUrl;
    private final GeminiQuotaTracker quota;

    @Autowired
    public GeminiCaller(SubtitleStudioProperties properties, GeminiQuotaTracker quota) {
        this(properties.gemini(), null, quota);
    }

    /** {@code baseUrl} points the SDK at a fake server in tests; null means the real Gemini API. */
    public GeminiCaller(SubtitleStudioProperties.Gemini settings, String baseUrl) {
        this(settings, baseUrl, new GeminiQuotaTracker(java.time.Clock.systemUTC()));
    }

    public GeminiCaller(SubtitleStudioProperties.Gemini settings, String baseUrl, GeminiQuotaTracker quota) {
        this.settings = settings;
        this.baseUrl = baseUrl;
        this.quota = quota;
    }

    /** The configured models in the order they are tried: the main model, then the fallbacks. */
    public static List<String> modelOrder(SubtitleStudioProperties.Gemini settings) {
        List<String> models = new ArrayList<>();
        models.add(settings.model());
        models.addAll(settings.fallbackModels());
        return models;
    }

    public Answer generate(List<Part> parts, GenerateContentConfig config) {
        return generate(parts, config, model -> {});
    }

    /** {@code onTrying} gets each model's name right before that model is asked (main model, then fallbacks). */
    public Answer generate(List<Part> parts, GenerateContentConfig config, Consumer<String> onTrying) {
        return generate(parts, config, onTrying, false);
    }

    /**
     * Same; with {@code allowTruncated} an answer cut off at the output limit (MAX_TOKENS) is returned with
     * {@link Answer#truncated()} set instead of being treated as a refusal.
     */
    public Answer generate(List<Part> parts, GenerateContentConfig config, Consumer<String> onTrying,
                           boolean allowTruncated) {
        GenerateContentResponse response = null;
        String answeredBy = null;
        Content content = Content.fromParts(parts.toArray(Part[]::new));
        boolean busy = false;
        boolean onlyPerMinuteLimits = true;
        try (Client client = client()) {
            List<String> all = modelOrder(settings);
            List<String> models = all.stream().filter(m -> !quota.isDailyExhausted(m)).toList();
            if (models.isEmpty()) {
                Instant reset = quota.earliestDailyReset(all);
                throw new TranslationFailedException(reset == null
                        ? "Gemini free quota is used up, try again later."
                        : "Gemini free quota is used up until " + RESET_FORMAT.format(reset) + " (Vietnam time).");
            }
            for (String model : models) {
                onTrying.accept(model);
                try {
                    response = client.models.generateContent(model, content, config);
                    answeredBy = model;
                    break;
                } catch (ApiException e) {
                    if (e.code() == 503) {
                        log.warn("Gemini model {} is overloaded (HTTP 503)", model);
                        busy = true;
                    } else if (e.code() == 429) {
                        boolean perMinute = logQuota(model, e.message());
                        onlyPerMinuteLimits &= perMinute;
                        Instant now = quota.now();
                        if (perMinute) {
                            quota.record(model, GeminiQuotaTracker.QuotaKind.MINUTE,
                                    now.plus(GeminiQuotaTracker.retryDelay(e.message())));
                        } else {
                            quota.record(model, GeminiQuotaTracker.QuotaKind.DAILY,
                                    GeminiQuotaTracker.nextDailyReset(now));
                        }
                    } else {
                        throw fromApi(e);
                    }
                }
            }
        } catch (GenAiIOException e) {
            throw causedByTimeout(e)
                    ? new TranslationFailedException("Gemini did not respond in time.")
                    : new TranslationFailedException("Could not translate: connection to Gemini failed.");
        }
        if (response == null) {
            if (busy) {
                throw new TranslationFailedException(
                        "Gemini is busy right now (high demand), try again in a few minutes.");
            }
            throw new TranslationFailedException(onlyPerMinuteLimits
                    ? "Gemini's per-minute limit was reached, try again in a minute."
                    : "Gemini free quota is used up, try again later.");
        }
        if (allowTruncated && isMaxTokens(response)) {
            String partial = textOrNull(response, true);
            return new Answer(partial == null ? "" : partial, answeredBy, true);
        }
        String text = textOrNull(response, false);
        if (text == null || text.isBlank()) {
            throw new TranslationFailedException("Gemini refused to translate this content.");
        }
        return new Answer(text, answeredBy);
    }

    /**
     * Logs which quota ran out (metric, limit, wait), never the rest of the message. Returns true when Gemini asks to
     * wait less than a minute, i.e. a per-minute limit rather than the daily quota.
     */
    private static boolean logQuota(String model, String message) {
        String text = message == null ? "" : message;
        Matcher metric = QUOTA_METRIC.matcher(text);
        Matcher retry = RETRY_SECONDS.matcher(text);
        Double seconds = retry.find() ? Double.valueOf(retry.group(1)) : null;
        log.warn("Gemini model {} is out of quota (HTTP 429): {}{}", model,
                metric.find() ? metric.group(1).strip() : "quota not named",
                seconds == null ? "" : ", retry in " + retry.group(1) + "s");
        return seconds != null && seconds < 60;
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
            case 401, 403 -> new TranslationFailedException("GEMINI_API_KEY is not valid.");
            default -> {
                // Error text from the API may echo request details; keep it out of the message and the log.
                log.warn("Gemini request failed with HTTP {}", e.code());
                yield new TranslationFailedException("Could not translate: Gemini returned error " + e.code() + ".");
            }
        };
    }

    /** The answer text, or null when Gemini stopped for another reason than STOP (blocked, truncated...). */
    private static boolean isMaxTokens(GenerateContentResponse response) {
        FinishReason reason = response.finishReason();
        return reason != null && reason.knownEnum() == FinishReason.Known.MAX_TOKENS;
    }

    private static String textOrNull(GenerateContentResponse response, boolean ignoreFinishReason) {
        FinishReason reason = response.finishReason();
        if (!ignoreFinishReason && reason != null && reason.knownEnum() != FinishReason.Known.STOP) {
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
