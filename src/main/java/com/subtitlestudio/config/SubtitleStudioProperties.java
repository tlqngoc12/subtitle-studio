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
public record SubtitleStudioProperties(@Valid @NotNull Ytdlp ytdlp, @NotNull Path dataDir) {

    /** Directory holding the original downloaded .vtt files: {@code {dataDir}/subs}. */
    public Path subsDir() {
        return dataDir.resolve("subs");
    }

    /** Directory holding uploaded profile images: {@code {dataDir}/media}. */
    public Path mediaDir() {
        return dataDir.resolve("media");
    }

    public record Ytdlp(@NotBlank String path, @NotNull Duration timeout) {}
}
