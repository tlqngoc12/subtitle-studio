package com.subtitlestudio;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class SubtitleStudioApplicationTests {

    @Autowired
    private SubtitleStudioProperties properties;

    @Test
    void contextLoads() {
        assertThat(properties).isNotNull();
    }

    @Test
    void bindsSubtitleStudioPropertiesFromApplicationYml() {
        assertThat(properties.ytdlp().path()).isEqualTo("yt-dlp");
        assertThat(properties.ytdlp().timeout()).isEqualTo(Duration.ofSeconds(60));
        assertThat(normalized(properties.dataDir())).isEqualTo(normalized(Path.of("./data")));
    }

    @Test
    void bindsGeminiDefaults() {
        assertThat(properties.gemini().timeout()).isEqualTo(Duration.ofMinutes(3));
        assertThat(properties.gemini().maxDuration()).isEqualTo(Duration.ofMinutes(180));
        assertThat(properties.gemini().partDuration()).isEqualTo(Duration.ofMinutes(45));
        assertThat(properties.gemini().temperature()).isEqualTo(0.3);
        assertThat(properties.gemini().model()).isEqualTo("gemini-3.6-flash");
        assertThat(properties.gemini().fallbackModels()).containsExactly("gemini-3.5-flash-lite", "gemini-3.5-flash");
        assertThat(properties.gemini().configured()).isTrue(); // test profile sets a dummy key
        assertThat(normalized(properties.promptsDir())).isEqualTo(normalized(Path.of("./data/prompts")));
    }

    @Test
    void derivesSubsDirUnderDataDir() {
        assertThat(normalized(properties.subsDir())).isEqualTo(normalized(Path.of("./data/subs")));
    }

    private static Path normalized(Path p) {
        return p.toAbsolutePath().normalize();
    }
}
