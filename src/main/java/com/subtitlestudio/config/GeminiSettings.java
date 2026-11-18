package com.subtitlestudio.config;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * The Gemini settings in force: the {@code application.yml} record with the overrides saved in {@code t_app_setting}
 * on top. {@link #current()} returns an in-memory snapshot (no DB read per call) that is replaced after a save has
 * committed. A caller reads it once per request and uses that one snapshot until the request ends, so a save in the
 * middle never changes models halfway. The API key always comes from the yml record and is never stored.
 */
@Component
public class GeminiSettings {

    public static final String MODEL = "gemini.model";
    public static final String FALLBACKS = "gemini.fallback-models";
    public static final String THINKING = "gemini.thinking-level";
    public static final String TEMPERATURE = "gemini.temperature";
    public static final String TIMEOUT = "gemini.timeout";
    public static final String COOLDOWN = "gemini.overload-cooldown";

    private static final Logger log = LoggerFactory.getLogger(GeminiSettings.class);
    private static final String PREFIX = "gemini.";
    /** Stored for "no fallback models": Oracle turns an empty string into NULL, which the column forbids. */
    private static final String NO_FALLBACKS = "-";
    private static final int MAX_FALLBACKS = 5;

    /** The form fields; a null, blank or default-equal field removes that override. */
    public record Form(String model, List<String> fallbackModels, String thinkingLevel, Double temperature,
                       Duration timeout, Duration overloadCooldown) {
    }

    /** A rejected value; {@code field} is the form field name the message belongs to. */
    public static class InvalidSettingException extends RuntimeException {

        private final String field;

        public InvalidSettingException(String field, String message) {
            super(message);
            this.field = field;
        }

        public String field() {
            return field;
        }
    }

    private record Snapshot(SubtitleStudioProperties.Gemini gemini, Set<String> overridden) {
    }

    private final SubtitleStudioProperties.Gemini defaults;
    private final AppSettingRepository repository;
    private final Clock clock;
    private volatile Snapshot snapshot;

    @Autowired
    public GeminiSettings(SubtitleStudioProperties properties, AppSettingRepository repository, Clock clock) {
        this.defaults = properties.gemini();
        this.repository = repository;
        this.clock = clock;
    }

    private GeminiSettings(SubtitleStudioProperties.Gemini fixed) {
        this.defaults = fixed;
        this.repository = null;
        this.clock = Clock.systemUTC();
        this.snapshot = new Snapshot(fixed, Set.of());
    }

    /** A test/helper instance whose {@link #current()} is always {@code gemini}; it has no database. */
    public static GeminiSettings fixed(SubtitleStudioProperties.Gemini gemini) {
        return new GeminiSettings(gemini);
    }

    /** The settings in force. Read it once at the start of a request and use that value to the end. */
    public SubtitleStudioProperties.Gemini current() {
        return snapshot().gemini();
    }

    /** The {@code application.yml} values. */
    public SubtitleStudioProperties.Gemini defaults() {
        return defaults;
    }

    /** The keys that currently have an override. */
    public Set<String> overridden() {
        return snapshot().overridden();
    }

    private Snapshot snapshot() {
        var s = snapshot;
        if (s == null) {
            synchronized (this) {
                if (snapshot == null) {
                    snapshot = load();
                }
                s = snapshot;
            }
        }
        return s;
    }

    /** Reads the overrides again from the database (after a save, and in tests). */
    public void reload() {
        if (repository == null) {
            return;
        }
        var fresh = load();
        synchronized (this) {
            snapshot = fresh;
        }
    }

    private Snapshot load() {
        Map<String, String> rows = new LinkedHashMap<>();
        for (var row : repository.findByKeyStartingWith(PREFIX)) {
            rows.put(row.getKey(), row.getValue());
        }
        try {
            return new Snapshot(merge(rows), new TreeSet<>(rows.keySet()));
        } catch (RuntimeException e) {
            // A hand-edited bad row must not take translation down: use the yml values and say why.
            log.warn("Ignoring Gemini setting overrides that cannot be applied: {}", e.getMessage());
            return new Snapshot(defaults, Set.of());
        }
    }

    private SubtitleStudioProperties.Gemini merge(Map<String, String> rows) {
        String model = rows.getOrDefault(MODEL, defaults.model());
        List<String> fallbacks = rows.containsKey(FALLBACKS) ? parseFallbacks(rows.get(FALLBACKS))
                : defaults.fallbackModels();
        String thinking = rows.getOrDefault(THINKING, defaults.thinkingLevel());
        double temperature = rows.containsKey(TEMPERATURE) ? Double.parseDouble(rows.get(TEMPERATURE))
                : defaults.temperature();
        Duration timeout = rows.containsKey(TIMEOUT) ? Duration.parse(rows.get(TIMEOUT)) : defaults.timeout();
        Duration cooldown = rows.containsKey(COOLDOWN) ? Duration.parse(rows.get(COOLDOWN))
                : defaults.overloadCooldown();
        return new SubtitleStudioProperties.Gemini(defaults.apiKey(), model, timeout, defaults.maxDuration(),
                defaults.partDuration(), temperature, fallbacks, thinking, cooldown);
    }

    private static List<String> parseFallbacks(String stored) {
        if (NO_FALLBACKS.equals(stored)) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String name : stored.split(",")) {
            if (!name.isBlank()) {
                out.add(name.strip());
            }
        }
        return out;
    }

    /**
     * Validates the whole form, then writes every changed override in one transaction. Nothing is written when any
     * field is invalid. The snapshot is replaced only after the transaction has committed. Returns the new settings.
     */
    @Transactional
    public SubtitleStudioProperties.Gemini save(Form form) {
        Map<String, String> wanted = validate(form);
        var now = clock.instant();
        var existing = new LinkedHashMap<String, AppSetting>();
        repository.findByKeyStartingWith(PREFIX).forEach(row -> existing.put(row.getKey(), row));
        for (String key : List.of(MODEL, FALLBACKS, THINKING, TEMPERATURE, TIMEOUT, COOLDOWN)) {
            String value = wanted.get(key);
            AppSetting row = existing.get(key);
            if (value == null) {
                if (row != null) {
                    repository.delete(row);
                }
            } else if (row == null) {
                repository.save(new AppSetting(key, value, now));
            } else {
                row.set(value, now);
                repository.save(row);
            }
        }
        repository.flush();
        // Never a mix: on rollback the old snapshot stays, on commit the new values are read back.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    reload();
                }
            });
        } else {
            reload();
        }
        return merge(wanted);
    }

    /** Returns the overrides to store (key to stored value); keys with no entry have no override. */
    private Map<String, String> validate(Form f) {
        Map<String, String> out = new LinkedHashMap<>();

        String model = f.model() == null ? "" : f.model().strip();
        if (!model.isEmpty() && !model.equals(defaults.model())) {
            out.put(MODEL, model);
        }
        String mainModel = model.isEmpty() ? defaults.model() : model;

        if (f.fallbackModels() != null) {
            List<String> list = new ArrayList<>();
            for (String name : f.fallbackModels()) {
                if (name == null || name.isBlank()) {
                    throw new InvalidSettingException("fallbackModels", "A fallback model name is empty.");
                }
                list.add(name.strip());
            }
            if (list.size() > MAX_FALLBACKS) {
                throw new InvalidSettingException("fallbackModels",
                        "Use at most " + MAX_FALLBACKS + " fallback models.");
            }
            if (new HashSet<>(list).size() != list.size()) {
                throw new InvalidSettingException("fallbackModels", "A fallback model is listed twice.");
            }
            if (list.contains(mainModel)) {
                throw new InvalidSettingException("fallbackModels",
                        "The main model cannot also be a fallback model.");
            }
            if (!list.equals(defaults.fallbackModels())) {
                out.put(FALLBACKS, list.isEmpty() ? NO_FALLBACKS : String.join(",", list));
            }
        } else if (defaults.fallbackModels().contains(mainModel)) {
            throw new InvalidSettingException("fallbackModels", "The main model cannot also be a fallback model.");
        }

        String thinking = f.thinkingLevel() == null ? "" : f.thinkingLevel().strip().toLowerCase(Locale.ROOT);
        if (!thinking.isEmpty()) {
            if (!List.of("minimal", "low", "medium", "high").contains(thinking)) {
                throw new InvalidSettingException("thinkingLevel",
                        "Thinking level must be minimal, low, medium or high.");
            }
            if (!thinking.equals(defaults.thinkingLevel())) {
                out.put(THINKING, thinking);
            }
        }

        if (f.temperature() != null) {
            double t = f.temperature();
            if (Double.isNaN(t) || t < 0 || t > 2) {
                throw new InvalidSettingException("temperature", "Temperature must be from 0 to 2.");
            }
            if (t != defaults.temperature()) {
                out.put(TEMPERATURE, Double.toString(t));
            }
        }

        if (f.timeout() != null) {
            if (f.timeout().compareTo(Duration.ofSeconds(10)) < 0
                    || f.timeout().compareTo(Duration.ofMinutes(10)) > 0) {
                throw new InvalidSettingException("timeoutSeconds", "Timeout must be from 10 seconds to 10 minutes.");
            }
            if (!f.timeout().equals(defaults.timeout())) {
                out.put(TIMEOUT, f.timeout().toString());
            }
        }

        if (f.overloadCooldown() != null) {
            if (f.overloadCooldown().isNegative() || f.overloadCooldown().compareTo(Duration.ofMinutes(60)) > 0) {
                throw new InvalidSettingException("overloadCooldownMinutes",
                        "Overload cooldown must be from 0 to 60 minutes.");
            }
            if (!f.overloadCooldown().equals(defaults.overloadCooldown())) {
                out.put(COOLDOWN, f.overloadCooldown().toString());
            }
        }
        return out;
    }
}
