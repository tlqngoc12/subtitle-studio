package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.genai.types.Model;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class GeminiModelListerTest {

    private static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-11-18T10:00:00Z");

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

    private static Model model(String name, String... actions) {
        return Model.builder().name(name).supportedActions(List.of(actions)).build();
    }

    @Test
    void filtersAndSorts() {
        var lister = new GeminiModelLister(() -> List.of(
                model("models/gemini-3.6-flash", "generateContent", "countTokens"),
                model("models/embedding-001", "embedContent"),
                model("models/gemini-embedding-001", "embedContent"),
                model("models/gemini-3.1-flash-lite", "generateContent"),
                model("models/gemma-3-27b", "generateContent")), new MutableClock());

        assertThat(lister.list()).containsExactly("gemini-3.1-flash-lite", "gemini-3.6-flash");
    }

    @Test
    void failureGivesEmpty() {
        var lister = new GeminiModelLister(() -> {
            throw new IllegalStateException("no API key");
        }, new MutableClock());

        assertThat(lister.list()).isEmpty();
    }

    @Test
    void cachesForOneHour() {
        var clock = new MutableClock();
        var calls = new AtomicInteger();
        var lister = new GeminiModelLister(() -> {
            calls.incrementAndGet();
            return List.of(model("models/gemini-a", "generateContent"));
        }, clock);

        lister.list();
        clock.now = clock.now.plus(Duration.ofMinutes(59));
        lister.list();
        assertThat(calls).hasValue(1);

        clock.now = clock.now.plus(Duration.ofMinutes(2));
        lister.list();
        assertThat(calls).hasValue(2);
    }

    @Test
    void failureIsNotCached() {
        var calls = new AtomicInteger();
        var lister = new GeminiModelLister(() -> {
            if (calls.incrementAndGet() == 1) {
                throw new IllegalStateException("boom");
            }
            return List.of(model("models/gemini-a", "generateContent"));
        }, new MutableClock());

        assertThat(lister.list()).isEmpty();
        assertThat(lister.list()).containsExactly("gemini-a");
    }
}
