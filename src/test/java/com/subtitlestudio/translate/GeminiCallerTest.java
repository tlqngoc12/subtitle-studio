package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.subtitlestudio.config.SubtitleStudioProperties;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class GeminiCallerTest {

    private final FakeGeminiServer server = new FakeGeminiServer();

    @AfterEach
    void stop() {
        server.close();
    }

    private GeminiCaller caller(List<String> fallbacks) {
        var gemini = new SubtitleStudioProperties.Gemini("k", "m1", Duration.ofSeconds(10), Duration.ofMinutes(60), 0.3,
                fallbacks);
        return new GeminiCaller(gemini, server.baseUrl());
    }

    @Test
    void reportsEachModelBeforeTryingIt() {
        server.replyText("ok", "STOP");
        server.replyForModel("m1", 503, "{}");
        List<String> tried = new ArrayList<>();

        GeminiCaller.Answer answer = caller(List.of("m2")).generate(List.of(Part.fromText("hi")),
                GenerateContentConfig.builder().build(), tried::add);

        assertThat(tried).containsExactly("m1", "m2");
        assertThat(answer.model()).isEqualTo("m2");
    }

    private static final Instant T0 = Instant.parse("2026-01-15T12:00:00Z");

    private static final class MutableClock extends Clock {
        Instant now = T0;

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private final MutableClock clock = new MutableClock();
    private final GeminiQuotaTracker tracker = new GeminiQuotaTracker(clock);

    private GeminiCaller trackedCaller(String... fallbacks) {
        var gemini = new SubtitleStudioProperties.Gemini("secret-key", "m1", Duration.ofSeconds(10),
                Duration.ofMinutes(60), 0.3, List.of(fallbacks));
        return new GeminiCaller(gemini, server.baseUrl(), tracker);
    }

    private static String quota429(String retry) {
        String message = "You exceeded your current quota, please check your plan and billing details.\\n"
                + "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, "
                + "limit: 20\\nPlease retry in " + retry + ".";
        return "{\"error\":{\"code\":429,\"message\":\"" + message + "\",\"status\":\"RESOURCE_EXHAUSTED\"}}";
    }

    private static String body429(String message) {
        return "{\"error\":{\"code\":429,\"message\":\"" + message + "\",\"status\":\"RESOURCE_EXHAUSTED\"}}";
    }

    /** A real free-tier daily 429: names the per-day limit and gives no retry hint. */
    private static String daily429() {
        return body429("You exceeded your current quota, please check your plan and billing details.\\n"
                + "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, "
                + "limit: 20, model: gemini-3.6-flash, description: Generate content requests per day limit exceeded "
                + "on Free Tier.");
    }

    @Test
    void aMessageNamingThePerDayLimitIsDailyEvenWithoutAHint() {
        server.replyForModel("m1", 429, daily429());
        server.replyText("ok", "STOP");

        trackedCaller("m2").generate(HI, NO_CONFIG);

        assertThat(tracker.active()).extracting(GeminiQuotaTracker.QuotaEntry::kind)
                .containsExactly(GeminiQuotaTracker.QuotaKind.DAILY);
    }

    @Test
    void aPerMinuteMessageWithoutAHintIsMinuteAndTheModelIsStillAsked() {
        server.replyForModel("m1", 429, body429("Generate content requests per minute limit exceeded"));
        server.replyText("ok", "STOP");
        GeminiCaller caller = trackedCaller("m2");
        caller.generate(HI, NO_CONFIG);
        List<String> tried = new ArrayList<>();

        caller.generate(HI, NO_CONFIG, tried::add);

        assertThat(tracker.active()).containsExactly(new GeminiQuotaTracker.QuotaEntry("m1",
                GeminiQuotaTracker.QuotaKind.MINUTE, T0.plusSeconds(60)));
        assertThat(tried).containsExactly("m1", "m2");
    }

    @Test
    void anUnknownMessageIsMinuteForAMinuteNeverADay() {
        server.replyForModel("m1", 429, body429("Resource exhausted"));
        server.replyText("ok", "STOP");

        trackedCaller("m2").generate(HI, NO_CONFIG);

        assertThat(tracker.active()).containsExactly(new GeminiQuotaTracker.QuotaEntry("m1",
                GeminiQuotaTracker.QuotaKind.MINUTE, T0.plusSeconds(60)));
    }

    @Test
    void anUnknownMessageWithALongHintIsMinuteForThatLong() {
        server.replyForModel("m1", 429, body429("Please retry in 120s."));
        server.replyText("ok", "STOP");

        trackedCaller("m2").generate(HI, NO_CONFIG);

        assertThat(tracker.active()).containsExactly(new GeminiQuotaTracker.QuotaEntry("m1",
                GeminiQuotaTracker.QuotaKind.MINUTE, T0.plusSeconds(120)));
    }

    private static final List<Part> HI = List.of(Part.fromText("hi"));
    private static final GenerateContentConfig NO_CONFIG = GenerateContentConfig.builder().build();

    @Test
    void aDailyQuotaErrorIsRecordedUntilTheNextLosAngelesMidnight() {
        server.replyForModel("m1", 429, daily429());
        server.replyText("ok", "STOP");

        trackedCaller("m2").generate(HI, NO_CONFIG);

        assertThat(tracker.active()).containsExactly(new GeminiQuotaTracker.QuotaEntry("m1",
                GeminiQuotaTracker.QuotaKind.DAILY, Instant.parse("2026-01-16T08:00:00Z")));
    }

    @Test
    void aPerMinuteLimitIsRecordedForTheDelayGeminiNames() {
        server.replyForModel("m1", 429, quota429("12.3s"));
        server.replyText("ok", "STOP");

        trackedCaller("m2").generate(HI, NO_CONFIG);

        assertThat(tracker.active()).containsExactly(new GeminiQuotaTracker.QuotaEntry("m1",
                GeminiQuotaTracker.QuotaKind.MINUTE, T0.plusMillis(12_300)));
    }

    @Test
    void aDailyExhaustedModelIsNotAskedAgain() {
        server.replyForModel("m1", 429, daily429());
        server.replyText("ok", "STOP");
        GeminiCaller caller = trackedCaller("m2");
        caller.generate(HI, NO_CONFIG);
        int afterFirst = server.requests();
        List<String> tried = new ArrayList<>();

        GeminiCaller.Answer second = caller.generate(HI, NO_CONFIG, tried::add);

        assertThat(second.model()).isEqualTo("m2");
        assertThat(tried).containsExactly("m2");
        assertThat(server.requests() - afterFirst).isEqualTo(1);
        assertThat(server.lastPath()).contains("/models/m2:");
    }

    @Test
    void aMinuteLimitedModelIsStillAsked() {
        server.replyForModel("m1", 429, quota429("12.3s"));
        server.replyText("ok", "STOP");
        GeminiCaller caller = trackedCaller("m2");
        caller.generate(HI, NO_CONFIG);
        List<String> tried = new ArrayList<>();

        caller.generate(HI, NO_CONFIG, tried::add);

        assertThat(tried).containsExactly("m1", "m2");
    }

    @Test
    void anExpiredEntryIsAskedAgain() {
        server.replyForModel("m1", 429, daily429());
        server.replyText("ok", "STOP");
        GeminiCaller caller = trackedCaller("m2");
        caller.generate(HI, NO_CONFIG);
        clock.now = Instant.parse("2026-01-16T08:00:01Z");
        server.replyForModel("m1", 200, "{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"back\"}]},"
                + "\"finishReason\":\"STOP\"}]}");

        GeminiCaller.Answer answer = caller.generate(HI, NO_CONFIG);

        assertThat(answer.model()).isEqualTo("m1");
        assertThat(answer.text()).isEqualTo("back");
        assertThat(tracker.active()).isEmpty();
    }

    @Test
    void whenEveryModelIsSkippedTheErrorNamesTheResetTimeAndNothingIsAsked() {
        server.replyForModel("m1", 429, daily429());
        server.replyForModel("m2", 429, daily429());
        GeminiCaller caller = trackedCaller("m2");
        try {
            caller.generate(HI, NO_CONFIG);
        } catch (TranslationFailedException expected) {
            // both record DAILY
        }
        int before = server.requests();

        assertThatThrownBy(() -> caller.generate(HI, NO_CONFIG)).isInstanceOf(TranslationFailedException.class)
                .hasMessage("Gemini free quota is used up until 15:00 (Vietnam time).");
        assertThat(server.requests()).isEqualTo(before);
    }

    @Test
    void theFirstRunOutOfQuotaKeepsTheExistingMessage() {
        server.reply(429, daily429());

        assertThatThrownBy(() -> trackedCaller().generate(HI, NO_CONFIG))
                .hasMessage("Gemini free quota is used up, try again later.");
    }

    @Test
    void quotaHandlingNeverLogsTheKeyOrThePrompt(CapturedOutput output) {
        server.reply(429, daily429());
        GeminiCaller caller = trackedCaller("m2");

        assertThatThrownBy(() -> caller.generate(List.of(Part.fromText("SECRET PROMPT")), NO_CONFIG));
        assertThatThrownBy(() -> caller.generate(List.of(Part.fromText("SECRET PROMPT")), NO_CONFIG));

        assertThat(output).doesNotContain("secret-key").doesNotContain("SECRET PROMPT");
    }

    @Test
    void twoArgumentOverloadStillWorks() {
        server.replyText("ok", "STOP");

        assertThat(caller(List.of()).generate(List.of(Part.fromText("hi")), GenerateContentConfig.builder().build())
                .model()).isEqualTo("m1");
    }

    private static final String MAIN = "gemini-test-flash";
    private static final String LITE = "gemini-test-lite";
    private static final String THIRD = "gemini-test-third";
    private static final String BUSY = "{\"error\":{\"code\":503,\"message\":\"High demand.\",\"status\":\"UNAVAILABLE\"}}";
    private static final String DAILY = "{\"error\":{\"code\":429,\"message\":\"Quota exceeded for metric: "
            + "generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, "
            + "model: x\nPlease retry in 30000s.\",\"status\":\"RESOURCE_EXHAUSTED\"}}";
    private static final Duration SLOW = Duration.ofSeconds(2);

    /** A caller with a 300 ms timeout whose main model is {@link #MAIN}, for the timeout tests. */
    private static GeminiCaller timeoutCaller(String baseUrl, String... fallbacks) {
        var gemini = new SubtitleStudioProperties.Gemini("test-key", MAIN, Duration.ofMillis(300),
                Duration.ofMinutes(60), 0.3, List.of(fallbacks));
        return new GeminiCaller(gemini, baseUrl);
    }

    private static String userMessage(Throwable e) {
        return ((TranslationFailedException) e).userMessage();
    }

    @Test
    void aTimeoutFallsBackToTheNextModel() {
        server.delayForModel(MAIN, SLOW);
        server.replyForModel(LITE, 200, "{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"ok\"}]},"
                + "\"finishReason\":\"STOP\"}]}");
        List<String> tried = new ArrayList<>();

        GeminiCaller.Answer answer = timeoutCaller(server.baseUrl(), LITE).generate(HI, NO_CONFIG, tried::add);

        assertThat(answer.text()).isEqualTo("ok");
        assertThat(answer.model()).isEqualTo(LITE);
        assertThat(tried).containsExactly(MAIN, LITE);
    }

    @Test
    void allModelsTimingOutFails() {
        server.delay(SLOW);

        assertThatThrownBy(() -> timeoutCaller(server.baseUrl(), LITE).generate(HI, NO_CONFIG))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini did not respond in time."));
    }

    @Test
    void aTimeoutThenBusyStillReportsTheTimeout() {
        server.delayForModel(MAIN, SLOW);
        server.replyForModel(LITE, 503, BUSY);

        assertThatThrownBy(() -> timeoutCaller(server.baseUrl(), LITE).generate(HI, NO_CONFIG))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini did not respond in time."));
    }

    @Test
    void busyThenDailyQuotaThenTimeoutReportsTheTimeout() {
        server.replyForModel(MAIN, 503, BUSY);
        server.replyForModel(LITE, 429, DAILY);
        server.delayForModel(THIRD, SLOW);

        assertThatThrownBy(() -> timeoutCaller(server.baseUrl(), LITE, THIRD).generate(HI, NO_CONFIG))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini did not respond in time."));
    }

    @Test
    void aConnectionErrorDoesNotFallBack() {
        String deadUrl = server.baseUrl();
        server.close();
        List<String> tried = new ArrayList<>();

        assertThatThrownBy(() -> timeoutCaller(deadUrl, LITE).generate(HI, NO_CONFIG, tried::add))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Could not translate: connection to Gemini failed."));
        assertThat(tried).containsExactly(MAIN);
    }
}
