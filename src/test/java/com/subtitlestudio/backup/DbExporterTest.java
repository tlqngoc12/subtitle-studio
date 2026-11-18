package com.subtitlestudio.backup;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class DbExporterTest {

    @Test
    void notSupportedOnH2() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:exporter-test;MODE=Oracle", "sa", ""));
        var properties = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), Path.of("data"),
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                        List.of()),
                new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));

        assertThat(new DbExporter(jdbc, properties).supported()).isFalse();
    }
}
