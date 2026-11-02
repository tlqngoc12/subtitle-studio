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
    void derivesSubsDirUnderDataDir() {
        assertThat(normalized(properties.subsDir())).isEqualTo(normalized(Path.of("./data/subs")));
    }

    private static Path normalized(Path p) {
        return p.toAbsolutePath().normalize();
    }
}
