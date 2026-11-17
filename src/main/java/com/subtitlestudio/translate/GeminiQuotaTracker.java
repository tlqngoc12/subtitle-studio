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
 * It also remembers 503 rests: a model that answered "overloaded" is not asked again until its rest ends. Rests are in
 * memory only, cleared by a restart, and not shown in {@code /api/gemini/quota}.
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
    private final Map<String, Instant> restingUntil = new ConcurrentHashMap<>();

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

    /** Rests {@code model} until {@code until}; a later rest end is never shortened by an earlier one. */
    public void recordOverloaded(String model, Instant until) {
        restingUntil.merge(model, until, (old, next) -> next.isAfter(old) ? next : old);
    }

    /** True while {@code model} is resting after a 503. */
    public boolean isResting(String model) {
        Instant until = restingUntil.get(model);
        return until != null && until.isAfter(clock.instant());
    }

    /** When the rest of {@code model} ends, or null when it is not resting. */
    public Instant restingUntil(String model) {
        return isResting(model) ? restingUntil.get(model) : null;
    }

    public void clearRest(String model) {
        restingUntil.remove(model);
    }

    /** The earliest end among the active rests of {@code models}, or null when none is resting. */
    public Instant earliestRestEnd(List<String> models) {
        Instant earliest = null;
        for (String model : models) {
            Instant until = restingUntil(model);
            if (until != null && (earliest == null || until.isBefore(earliest))) {
                earliest = until;
            }
        }
        return earliest;
    }

    /** Forgets every entry and rest (tests that share one tracker bean). */
    void clear() {
        entries.clear();
        restingUntil.clear();
    }

    public Instant now() {
        return clock.instant();
    }

    /** The next midnight in America/Los_Angeles after {@code now} (DST-aware). */
    public static Instant nextDailyReset(Instant now) {
        return now.atZone(RESET_ZONE).toLocalDate().plusDays(1).atStartOfDay(RESET_ZONE).toInstant();
    }

    /** What a 429 means: which kind of limit, and how long a MINUTE limit lasts (unused for DAILY). */
    public record Classification(QuotaKind kind, Duration delay) {}

    /**
     * Classifies a 429 message. DAILY only when it names a per-day limit ("per day", "PerDay"); a model is never
     * skipped for a day on a guess. Everything else is MINUTE, lasting the retry delay the message states (60 s when it
     * states none), whether it says "per minute", gives a short hint, or is unknown.
     */
    public static Classification classify(String message) {
        String text = message == null ? "" : message.toLowerCase(java.util.Locale.ROOT);
        Duration delay = retryDelay(message);
        if (text.contains("per day") || text.contains("perday")) {
            return new Classification(QuotaKind.DAILY, delay);
        }
        return new Classification(QuotaKind.MINUTE, delay);
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
