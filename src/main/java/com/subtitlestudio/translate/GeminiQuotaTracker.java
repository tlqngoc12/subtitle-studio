package com.subtitlestudio.translate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Remembers, in memory only, which Gemini models answered HTTP 429 and until when. {@link GeminiCaller} records every
 * 429 here and skips models whose daily quota is used up, so one run does not keep mixing models. Entries expire at
 * their reset time; nothing survives a restart (a model may then be tried once more and recorded again).
 */
@Component
public class GeminiQuotaTracker {

    /** DAILY: the free-tier daily quota (resets at midnight Pacific). MINUTE: a per-minute limit that clears soon. */
    public enum QuotaKind { DAILY, MINUTE }

    public record QuotaEntry(String model, QuotaKind kind, Instant resetAt) {}

    /** Gemini's free-tier daily quota resets at midnight in this zone. */
    static final ZoneId RESET_ZONE = ZoneId.of("America/Los_Angeles");

    private static final Pattern RETRY_SECONDS = Pattern.compile("retry in (\\d+(?:\\.\\d+)?)s\\b");
    private static final Duration DEFAULT_RETRY = Duration.ofSeconds(60);

    private final Clock clock;
    private final Map<String, QuotaEntry> entries = new ConcurrentHashMap<>();

    @Autowired
    public GeminiQuotaTracker(Clock clock) {
        this.clock = clock;
    }

    /** A DAILY entry that is still active is never replaced by a MINUTE one. */
    public void record(String model, QuotaKind kind, Instant resetAt) {
        Instant now = clock.instant();
        entries.merge(model, new QuotaEntry(model, kind, resetAt), (old, next) -> {
            boolean oldActive = old.resetAt().isAfter(now);
            if (oldActive && old.kind() == QuotaKind.DAILY && next.kind() == QuotaKind.MINUTE) {
                return old;
            }
            return next;
        });
    }

    /** Entries whose reset time has not come yet, in model-name order. */
    public List<QuotaEntry> active() {
        Instant now = clock.instant();
        entries.values().removeIf(e -> !e.resetAt().isAfter(now));
        List<QuotaEntry> out = new ArrayList<>(entries.values());
        out.sort(java.util.Comparator.comparing(QuotaEntry::model));
        return out;
    }

    public boolean isDailyExhausted(String model) {
        QuotaEntry e = entries.get(model);
        return e != null && e.kind() == QuotaKind.DAILY && e.resetAt().isAfter(clock.instant());
    }

    /** The first of {@code models} (in the given order) without an active DAILY entry, or null. */
    public String firstAvailable(List<String> models) {
        for (String model : models) {
            if (!isDailyExhausted(model)) {
                return model;
            }
        }
        return null;
    }

    /** The earliest reset time among the active DAILY entries of {@code models}, or null when there are none. */
    public Instant earliestDailyReset(List<String> models) {
        Instant earliest = null;
        for (String model : models) {
            QuotaEntry e = entries.get(model);
            if (isDailyExhausted(model) && (earliest == null || e.resetAt().isBefore(earliest))) {
                earliest = e.resetAt();
            }
        }
        return earliest;
    }

    /** Forgets every entry (tests that share one tracker bean). */
    void clear() {
        entries.clear();
    }

    public Instant now() {
        return clock.instant();
    }

    /** The next midnight in America/Los_Angeles after {@code now} (DST-aware). */
    public static Instant nextDailyReset(Instant now) {
        return now.atZone(RESET_ZONE).toLocalDate().plusDays(1).atStartOfDay(RESET_ZONE).toInstant();
    }

    /** The wait Gemini's message states ("retry in 12.3s"), or 60 seconds when it states none. */
    public static Duration retryDelay(String message) {
        if (message == null) {
            return DEFAULT_RETRY;
        }
        Matcher m = RETRY_SECONDS.matcher(message);
        if (!m.find()) {
            return DEFAULT_RETRY;
        }
        return Duration.ofMillis(Math.round(Double.parseDouble(m.group(1)) * 1000));
    }
}
