package com.subtitlestudio.config;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * A minimal {@link SubtitleStudioProperties} bean and a fixed {@link GeminiSettings} bean (main model "m") for
 * slices that wire a class reading them.
 */
@TestConfiguration
public class MainModelTestConfig {

    @Bean
    SubtitleStudioProperties properties() {
        return new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), Path.of("data"), gemini(),
                new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
    }

    @Bean
    GeminiSettings geminiSettings() {
        return GeminiSettings.fixed(gemini());
    }

    private static SubtitleStudioProperties.Gemini gemini() {
        return new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                List.of());
    }
}
