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
 * "overloaded" (503), time out or are "out of quota" (429; free-tier quotas are counted per model), no automatic retries of the same
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
        // What each model did, for the "busy" message: 503, timeout, or a daily 429 (a model skipped as exhausted counts as daily).
        java.util.Set<String> overloaded = new java.util.HashSet<>();
        java.util.Set<String> noAnswer = new java.util.HashSet<>();
        java.util.Set<String> outOfQuota = new java.util.HashSet<>();
        boolean busy = false;
        boolean timedOut = false;
        boolean onlyPerMinuteLimits = true;
        List<String> all = modelOrder(settings);
        try (Client client = client()) {
            List<String> models = all.stream().filter(m -> !quota.isDailyExhausted(m)).toList();
            all.stream().filter(m -> !models.contains(m)).forEach(outOfQuota::add);
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
                        overloaded.add(model);
                    } else if (e.code() == 429) {
                        GeminiQuotaTracker.Classification kind = GeminiQuotaTracker.classify(e.message());
                        logQuota(model, e.message(), kind.kind());
                        Instant now = quota.now();
                        if (kind.kind() == GeminiQuotaTracker.QuotaKind.MINUTE) {
                            quota.record(model, GeminiQuotaTracker.QuotaKind.MINUTE, now.plus(kind.delay()));
                        } else {
                            onlyPerMinuteLimits = false;
                            outOfQuota.add(model);
                            quota.record(model, GeminiQuotaTracker.QuotaKind.DAILY,
                                    GeminiQuotaTracker.nextDailyReset(now));
                        }
                    } else {
                        throw fromApi(e);
                    }
                } catch (GenAiIOException e) {
                    if (!causedByTimeout(e)) {
                        throw new TranslationFailedException("Could not translate: connection to Gemini failed.");
                    }
                    log.warn("Gemini model {} did not respond within {}s", model, settings.timeout().toSeconds());
                    timedOut = true;
                    noAnswer.add(model);
                }
            }
        }
        if (response == null) {
            if (!outOfQuota.isEmpty() && (busy || timedOut)) {
                throw new TranslationFailedException(busyMessage(all, overloaded, noAnswer, outOfQuota));
            }
            if (timedOut) {
                throw new TranslationFailedException("Gemini did not respond in time.");
            }
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
     * "Gemini is busy: A is overloaded, B did not respond in time; C, D are out of free quota until 15:00 (Vietnam
     * time). Try again in a few minutes." Models are named in the order they are tried.
     */
    private String busyMessage(List<String> all, java.util.Set<String> overloaded, java.util.Set<String> noAnswer,
                               java.util.Set<String> outOfQuota) {
        List<String> busyParts = new ArrayList<>();
        for (String model : all) {
            if (overloaded.contains(model)) {
                busyParts.add(model + " is overloaded");
            } else if (noAnswer.contains(model)) {
                busyParts.add(model + " did not respond in time");
            }
        }
        List<String> exhausted = all.stream().filter(outOfQuota::contains).toList();
        Instant reset = quota.earliestDailyReset(exhausted);
        String until = reset == null ? "for today" : "until " + RESET_FORMAT.format(reset) + " (Vietnam time)";
        String quotaPart = String.join(", ", exhausted) + (exhausted.size() == 1 ? " is" : " are")
                + " out of free quota " + until;
        return "Gemini is busy: " + String.join(", ", busyParts) + "; " + quotaPart + ". Try again in a few minutes.";
    }

    /** Logs which quota ran out (metric, limit, wait, kind), never the rest of the message. */
    private static void logQuota(String model, String message, GeminiQuotaTracker.QuotaKind kind) {
        String text = message == null ? "" : message;
        Matcher metric = QUOTA_METRIC.matcher(text);
        Matcher retry = RETRY_SECONDS.matcher(text);
        Double seconds = retry.find() ? Double.valueOf(retry.group(1)) : null;
        log.warn("Gemini model {} is out of quota (HTTP 429): {}{}; treated as {}", model,
                metric.find() ? metric.group(1).strip() : "quota not named",
                seconds == null ? "" : ", retry in " + retry.group(1) + "s", kind);
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
