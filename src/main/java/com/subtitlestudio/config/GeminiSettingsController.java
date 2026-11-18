package com.subtitlestudio.config;

import com.subtitlestudio.translate.GeminiModelLister;
import java.time.Duration;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin API for the Gemini settings. The API key is never part of a request or a response: it stays in
 * {@code .env}, and {@code configured} only says whether one is set.
 */
@RestController
public class GeminiSettingsController {

    /** The values of one settings snapshot; {@code thinkingLevel} is "" when none is sent. */
    public record Values(String model, List<String> fallbackModels, String thinkingLevel, double temperature,
                         long timeoutSeconds, long overloadCooldownMinutes) {

        static Values of(SubtitleStudioProperties.Gemini g) {
            return new Values(g.model(), g.fallbackModels(), g.thinkingLevel(), g.temperature(),
                    g.timeout().toSeconds(), g.overloadCooldown().toMinutes());
        }
    }

    public record SettingsDto(Values effective, Values defaults, List<String> overridden, boolean configured) {
    }

    /** The PUT body: every field of the form; null, blank or equal to the default removes that override. */
    public record SettingsRequest(String model, List<String> fallbackModels, String thinkingLevel, Double temperature,
                                  Long timeoutSeconds, Long overloadCooldownMinutes) {
    }

    private final GeminiSettings settings;
    private final GeminiModelLister models;

    public GeminiSettingsController(GeminiSettings settings, GeminiModelLister models) {
        this.settings = settings;
        this.models = models;
    }

    @GetMapping("/api/settings/gemini")
    public SettingsDto get() {
        return dto();
    }

    @PutMapping("/api/settings/gemini")
    public SettingsDto put(@RequestBody SettingsRequest request) {
        settings.save(new GeminiSettings.Form(request.model(), request.fallbackModels(), request.thinkingLevel(),
                request.temperature(),
                request.timeoutSeconds() == null ? null : Duration.ofSeconds(request.timeoutSeconds()),
                request.overloadCooldownMinutes() == null ? null : Duration.ofMinutes(request.overloadCooldownMinutes())));
        return dto();
    }

    @GetMapping("/api/settings/gemini/models")
    public List<String> models() {
        return models.list();
    }

    private SettingsDto dto() {
        var current = settings.current();
        return new SettingsDto(Values.of(current), Values.of(settings.defaults()),
                List.copyOf(settings.overridden()), current.configured());
    }
}
