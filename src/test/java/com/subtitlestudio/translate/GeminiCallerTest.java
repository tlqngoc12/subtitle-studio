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

    @Test
    void usesOneSnapshotPerCall() {
        var a = new SubtitleStudioProperties.Gemini("k", "m1", Duration.ofSeconds(10), Duration.ofMinutes(60), 0.3,
                List.of("m2"));
        var b = new SubtitleStudioProperties.Gemini("k", "x1", Duration.ofSeconds(10), Duration.ofMinutes(60), 0.3,
                List.of("x2"));
        var settings = org.mockito.Mockito.mock(com.subtitlestudio.config.GeminiSettings.class);
        org.mockito.Mockito.when(settings.current()).thenReturn(a, b);
        server.replyText("ok", "STOP");
        server.replyForModel("m1", 503, "{}");
        List<String> tried = new ArrayList<>();

        var answer = new GeminiCaller(settings, server.baseUrl(), new GeminiQuotaTracker(Clock.systemUTC()))
                .generate(List.of(Part.fromText("hi")), GenerateContentConfig.builder().build(), tried::add);

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
    void busyThenDailyQuotaThenTimeoutNamesBothGroups() {
        server.replyForModel(MAIN, 503, BUSY);
        server.replyForModel(LITE, 429, daily429());
        server.delayForModel(THIRD, Duration.ofSeconds(8));

        // A generous timeout: the first request to the fake server can take a second or two on a busy machine.
        var gemini = new SubtitleStudioProperties.Gemini("test-key", MAIN, Duration.ofSeconds(4),
                Duration.ofMinutes(60), 0.3, List.of(LITE, THIRD));
        assertThatThrownBy(() -> new GeminiCaller(gemini, server.baseUrl()).generate(HI, NO_CONFIG))
                .satisfies(e -> assertThat(userMessage(e)).startsWith("Gemini is busy: " + MAIN + " is overloaded, "
                        + THIRD + " did not respond in time; " + LITE + " is out of free quota until ")
                        .endsWith(" (Vietnam time). Try again in a few minutes."));
    }

    private static final String FLASH36 = "gemini-3.6-flash";
    private static final String LITE35 = "gemini-3.5-flash-lite";
    private static final String FLASH35 = "gemini-3.5-flash";

    /** A caller on the fixed test clock whose models are the three real names, in this order. */
    private GeminiCaller busyCaller() {
        return busyCaller(Duration.ofSeconds(10), LITE35, FLASH35);
    }

    private GeminiCaller busyCaller(Duration timeout, String... fallbacks) {
        var gemini = new SubtitleStudioProperties.Gemini("secret-key", FLASH36, timeout,
                Duration.ofMinutes(60), 0.3, List.of(fallbacks));
        return new GeminiCaller(gemini, server.baseUrl(), tracker);
    }

    @Test
    void busy_message_names_overloaded_and_exhausted_models() {
        server.replyForModel(FLASH36, 429, daily429());
        server.replyForModel(LITE35, 503, BUSY);
        server.replyForModel(FLASH35, 429, daily429());

        assertThatThrownBy(() -> busyCaller().generate(HI, NO_CONFIG)).isInstanceOf(TranslationFailedException.class)
                .hasMessage("Gemini is busy: gemini-3.5-flash-lite is overloaded; gemini-3.6-flash, gemini-3.5-flash "
                        + "are out of free quota until 15:00 (Vietnam time). Try again in a few minutes.");
    }

    @Test
    void busy_message_counts_models_skipped_as_exhausted() {
        tracker.record(FLASH36, GeminiQuotaTracker.QuotaKind.DAILY, Instant.parse("2026-01-16T08:00:00Z"));
        tracker.record(FLASH35, GeminiQuotaTracker.QuotaKind.DAILY, Instant.parse("2026-01-16T08:00:00Z"));
        server.replyForModel(LITE35, 503, BUSY);

        assertThatThrownBy(() -> busyCaller().generate(HI, NO_CONFIG)).isInstanceOf(TranslationFailedException.class)
                .hasMessage("Gemini is busy: gemini-3.5-flash-lite is overloaded; gemini-3.6-flash, gemini-3.5-flash "
                        + "are out of free quota until 15:00 (Vietnam time). Try again in a few minutes.");
        assertThat(server.requests()).isEqualTo(1);
    }

    @Test
    void timeout_named_in_busy_message() {
        server.replyForModel(FLASH36, 429, daily429());
        server.delayForModel(LITE35, Duration.ofSeconds(8));
        server.replyForModel(FLASH35, 429, daily429());

        assertThatThrownBy(() -> busyCaller(Duration.ofSeconds(4), FLASH35, LITE35).generate(HI, NO_CONFIG)).isInstanceOf(TranslationFailedException.class)
                .hasMessage("Gemini is busy: gemini-3.5-flash-lite did not respond in time; gemini-3.6-flash, "
                        + "gemini-3.5-flash are out of free quota until 15:00 (Vietnam time). Try again in a few minutes.");
    }

    @Test
    void one_exhausted_model_is_named_in_the_singular() {
        server.replyForModel(FLASH36, 429, daily429());
        server.replyForModel(LITE35, 503, BUSY);
        server.replyForModel(FLASH35, 503, BUSY);

        assertThatThrownBy(() -> busyCaller().generate(HI, NO_CONFIG)).isInstanceOf(TranslationFailedException.class)
                .hasMessage("Gemini is busy: gemini-3.5-flash-lite is overloaded, gemini-3.5-flash is overloaded; "
                        + "gemini-3.6-flash is out of free quota until 15:00 (Vietnam time). Try again in a few minutes.");
    }

    @Test
    void all_overloaded_keeps_old_message() {
        server.reply(503, BUSY);

        assertThatThrownBy(() -> busyCaller().generate(HI, NO_CONFIG)).isInstanceOf(TranslationFailedException.class)
                .hasMessage("Gemini is busy right now (high demand), try again in a few minutes.");
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

    // ---- 503 rest (overload-cooldown) ----

    private static final String OK_BODY = "{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":"
            + "[{\"text\":\"ok\"}]},\"finishReason\":\"STOP\"}]}";

    private GeminiCaller restCaller(Duration cooldown) {
        var gemini = new SubtitleStudioProperties.Gemini("secret-key", "m1", Duration.ofSeconds(10),
                Duration.ofMinutes(60), Duration.ofMinutes(45), 0.3, List.of("m2"), null, cooldown);
        return new GeminiCaller(gemini, server.baseUrl(), tracker);
    }

    private GeminiCaller restCaller() {
        return restCaller(Duration.ofMinutes(10));
    }

    @Test
    void aModelThatAnswered503RestsAndTheNextCallSkipsIt() {
        server.replyForModel("m1", 503, BUSY);
        server.replyForModel("m2", 200, OK_BODY);
        restCaller().generate(HI, NO_CONFIG);
        int before = server.requests();
        List<String> tried = new ArrayList<>();

        GeminiCaller.Answer answer = restCaller().generate(HI, NO_CONFIG, tried::add);

        assertThat(tried).containsExactly("m2");
        assertThat(answer.model()).isEqualTo("m2");
        assertThat(server.requests()).isEqualTo(before + 1);
    }

    @Test
    void aModelIsAskedAgainWhenItsRestHasEnded() {
        server.replyForModel("m1", 503, BUSY);
        server.replyForModel("m2", 200, OK_BODY);
        restCaller().generate(HI, NO_CONFIG);
        clock.now = clock.now.plus(Duration.ofMinutes(10)).plusSeconds(1);
        List<String> tried = new ArrayList<>();

        restCaller().generate(HI, NO_CONFIG, tried::add);

        assertThat(tried).containsExactly("m1", "m2");
    }

    @Test
    void everyModelRestingFailsAtOnceWithoutAnyRequest() {
        server.reply(503, BUSY);
        assertThatThrownBy(() -> restCaller().generate(HI, NO_CONFIG)).isInstanceOf(TranslationFailedException.class)
                .hasMessage("Gemini is busy right now (high demand), try again in a few minutes.");
        int before = server.requests();

        assertThatThrownBy(() -> restCaller().generate(HI, NO_CONFIG)).isInstanceOf(TranslationFailedException.class)
                .hasMessage("Gemini is overloaded right now. Try again after 19:10 (Vietnam time).");
        assertThat(server.requests()).isEqualTo(before);
    }

    @Test
    void aRestingModelAndAnExhaustedOneGiveTheBusyMessageWithoutAnyRequest() {
        tracker.recordOverloaded("m1", clock.now.plus(Duration.ofMinutes(10)));
        tracker.record("m2", GeminiQuotaTracker.QuotaKind.DAILY, Instant.parse("2026-01-16T08:00:00Z"));

        assertThatThrownBy(() -> restCaller().generate(HI, NO_CONFIG)).isInstanceOf(TranslationFailedException.class)
                .hasMessage("Gemini is busy: m1 is overloaded; m2 is out of free quota until 15:00 (Vietnam time). "
                        + "Try again in a few minutes.");
        assertThat(server.requests()).isZero();
    }

    @Test
    void withoutACooldownAModelIsAskedOnEveryCall() {
        server.replyForModel("m1", 503, BUSY);
        server.replyForModel("m2", 200, OK_BODY);
        List<String> tried = new ArrayList<>();

        restCaller(Duration.ZERO).generate(HI, NO_CONFIG, tried::add);
        restCaller(Duration.ZERO).generate(HI, NO_CONFIG, tried::add);

        assertThat(tried).containsExactly("m1", "m2", "m1", "m2");
        assertThat(tracker.isResting("m1")).isFalse();
    }

    @Test
    void aModelThatAnswersAfterItsRestIsNoLongerResting() {
        tracker.recordOverloaded("m1", clock.now.plus(Duration.ofMinutes(10)));
        clock.now = clock.now.plus(Duration.ofMinutes(11));
        server.replyText("ok", "STOP");

        GeminiCaller.Answer answer = restCaller().generate(HI, NO_CONFIG);

        assertThat(answer.model()).isEqualTo("m1");
        assertThat(tracker.isResting("m1")).isFalse();
    }

    @Test
    void skippingARestingModelIsLoggedWithoutTheRequestText(CapturedOutput output) {
        server.replyForModel("m1", 503, BUSY);
        server.replyForModel("m2", 200, OK_BODY);
        List<Part> secret = List.of(Part.fromText("PROMPT-TEXT-MUST-NOT-BE-LOGGED"));
        restCaller().generate(secret, NO_CONFIG);
        restCaller().generate(secret, NO_CONFIG);

        assertThat(output.getAll()).contains("Gemini model m1 is resting after a 503 until ")
                .contains("; skipped").doesNotContain("PROMPT-TEXT-MUST-NOT-BE-LOGGED").doesNotContain("secret-key");
    }
}
