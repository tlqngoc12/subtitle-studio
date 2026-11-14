package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.translate.GeminiQuotaTracker.QuotaEntry;
import com.subtitlestudio.translate.GeminiQuotaTracker.QuotaKind;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class GeminiQuotaTrackerTest {

    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");

    /** A clock the test can move. */
    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

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

    @Test
    void dailyResetInWinterIsThreePmInVietnam() {
        Instant reset = GeminiQuotaTracker.nextDailyReset(Instant.parse("2026-01-15T12:00:00Z"));

        ZonedDateTime vn = reset.atZone(VIETNAM);
        assertThat(vn.getHour()).isEqualTo(15);
        assertThat(vn.getMinute()).isZero();
        assertThat(reset).isEqualTo(Instant.parse("2026-01-16T08:00:00Z"));
    }

    @Test
    void dailyResetInSummerIsTwoPmInVietnam() {
        Instant reset = GeminiQuotaTracker.nextDailyReset(Instant.parse("2026-07-15T12:00:00Z"));

        assertThat(reset.atZone(VIETNAM).getHour()).isEqualTo(14);
        assertThat(reset).isEqualTo(Instant.parse("2026-07-16T07:00:00Z"));
    }

    @Test
    void justAfterMidnightInLosAngelesTheResetIsTheNextMidnight() {
        // 08:00:01Z on 16 January is 00:00:01 PST: the reset moves to the 17th
        assertThat(GeminiQuotaTracker.nextDailyReset(Instant.parse("2026-01-16T08:00:01Z")))
                .isEqualTo(Instant.parse("2026-01-17T08:00:00Z"));
    }

    @Test
    void retryDelayIsReadFromTheMessage() {
        assertThat(GeminiQuotaTracker.retryDelay("Please retry in 12.3s.")).isEqualTo(Duration.ofMillis(12_300));
        assertThat(GeminiQuotaTracker.retryDelay("... retry in 33s")).isEqualTo(Duration.ofSeconds(33));
    }

    @Test
    void retryDelayDefaultsToAMinute() {
        assertThat(GeminiQuotaTracker.retryDelay("Resource exhausted")).isEqualTo(Duration.ofSeconds(60));
        assertThat(GeminiQuotaTracker.retryDelay(null)).isEqualTo(Duration.ofSeconds(60));
        assertThat(GeminiQuotaTracker.retryDelay("retry in 20h5m3s")).isEqualTo(Duration.ofSeconds(60));
    }

    @Test
    void anEntryIsActiveUntilItsResetTimeThenGone() {
        var clock = new MutableClock(Instant.parse("2026-01-15T12:00:00Z"));
        var tracker = new GeminiQuotaTracker(clock);
        Instant reset = Instant.parse("2026-01-16T08:00:00Z");
        tracker.record("m1", QuotaKind.DAILY, reset);

        assertThat(tracker.isDailyExhausted("m1")).isTrue();
        assertThat(tracker.isDailyExhausted("m2")).isFalse();
        assertThat(tracker.active()).containsExactly(new QuotaEntry("m1", QuotaKind.DAILY, reset));

        clock.advance(Duration.ofHours(20));

        assertThat(tracker.isDailyExhausted("m1")).isFalse();
        assertThat(tracker.active()).isEmpty();
    }

    @Test
    void aMinuteEntryIsNotDailyExhausted() {
        var clock = new MutableClock(Instant.parse("2026-01-15T12:00:00Z"));
        var tracker = new GeminiQuotaTracker(clock);
        tracker.record("m1", QuotaKind.MINUTE, clock.instant().plusSeconds(30));

        assertThat(tracker.isDailyExhausted("m1")).isFalse();
        assertThat(tracker.active()).hasSize(1);
    }

    @Test
    void aMinuteEntryNeverReplacesAnActiveDailyOne() {
        var clock = new MutableClock(Instant.parse("2026-01-15T12:00:00Z"));
        var tracker = new GeminiQuotaTracker(clock);
        Instant reset = Instant.parse("2026-01-16T08:00:00Z");
        tracker.record("m1", QuotaKind.DAILY, reset);
        tracker.record("m1", QuotaKind.MINUTE, clock.instant().plusSeconds(30));

        assertThat(tracker.active()).containsExactly(new QuotaEntry("m1", QuotaKind.DAILY, reset));
    }

    @Test
    void firstAvailableFollowsTheConfiguredOrder() {
        var clock = new MutableClock(Instant.parse("2026-01-15T12:00:00Z"));
        var tracker = new GeminiQuotaTracker(clock);
        tracker.record("m1", QuotaKind.DAILY, Instant.parse("2026-01-16T08:00:00Z"));

        assertThat(tracker.firstAvailable(List.of("m1", "m2", "m3"))).isEqualTo("m2");
        tracker.record("m2", QuotaKind.DAILY, Instant.parse("2026-01-16T08:00:00Z"));
        tracker.record("m3", QuotaKind.DAILY, Instant.parse("2026-01-16T08:00:00Z"));
        assertThat(tracker.firstAvailable(List.of("m1", "m2", "m3"))).isNull();
    }
}
