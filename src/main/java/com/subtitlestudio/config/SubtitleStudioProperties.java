package com.subtitlestudio.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.nio.file.Path;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** Application settings bound from the {@code subtitle-studio.*} prefix in application.yml. */
@Validated
@ConfigurationProperties(prefix = "subtitle-studio")
public record SubtitleStudioProperties(@Valid @NotNull Ytdlp ytdlp, @NotNull Path dataDir, @Valid @NotNull Gemini gemini) {

    /** Directory holding the original downloaded .vtt files: {@code {dataDir}/subs}. */
    public Path subsDir() {
        return dataDir.resolve("subs");
    }

    /** Translation profiles ({@code <name>.md}) for Gemini: {@code {dataDir}/prompts}. */
    public Path promptsDir() {
        return dataDir.resolve("prompts");
    }

    public record Ytdlp(@NotBlank String path, @NotNull Duration timeout) {}

    /** Gemini translation. A blank {@code apiKey} turns the feature off. Never log the key. */
    public record Gemini(String apiKey, @NotBlank String model, @NotNull Duration timeout,
                         @NotNull Duration maxDuration, double temperature) {

        public boolean configured() {
            return apiKey != null && !apiKey.isBlank();
        }

        @Override
        public String toString() {
            return "Gemini[model=" + model + ", configured=" + configured() + "]";
        }
    }
}
