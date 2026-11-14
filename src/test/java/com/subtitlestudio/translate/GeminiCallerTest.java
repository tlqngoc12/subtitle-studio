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

    private static final List<Part> HI = List.of(Part.fromText("hi"));
    private static final GenerateContentConfig NO_CONFIG = GenerateContentConfig.builder().build();

    @Test
    void aDailyQuotaErrorIsRecordedUntilTheNextLosAngelesMidnight() {
        server.replyForModel("m1", 429, quota429("20h5m3s"));
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
        server.replyForModel("m1", 429, quota429("20h5m3s"));
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
        server.replyForModel("m1", 429, quota429("20h5m3s"));
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
        server.replyForModel("m1", 429, quota429("20h5m3s"));
        server.replyForModel("m2", 429, quota429("20h5m3s"));
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
        server.reply(429, quota429("20h5m3s"));

        assertThatThrownBy(() -> trackedCaller().generate(HI, NO_CONFIG))
                .hasMessage("Gemini free quota is used up, try again later.");
    }

    @Test
    void quotaHandlingNeverLogsTheKeyOrThePrompt(CapturedOutput output) {
        server.reply(429, quota429("20h5m3s"));
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
}
