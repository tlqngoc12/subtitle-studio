package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import org.h2.tools.RunScript;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The real user database was created by Phase 1 and already has rows. New NOT NULL columns must
 * come with a default, or Hibernate's schema update fails and the app does not start.
 */
@SpringBootTest
class SchemaUpgradeTest {

    private static final Path DIR = createPhase1Database();

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", SchemaUpgradeTest::url);
        registry.add("subtitle-studio.data-dir", DIR::toString);
    }

    @Autowired
    private VideoRepository videos;

    @Test
    void startsOnPhase1DatabaseWithNoVietsub() {
        Video video = videos.findById("dQw4w9WgXcQ").orElseThrow();

        assertThat(video.getTitle()).isEqualTo("Old video");
        assertThat(video.getViCueCount()).isZero();
        assertThat(video.getViUpdatedAt()).isNull();
    }

    private static String url() {
        return "jdbc:h2:file:" + DIR.resolve("db").toAbsolutePath();
    }

    private static Path createPhase1Database() {
        try {
            Path dir = Files.createTempDirectory("subtitle-studio-upgrade");
            try (Connection c = DriverManager.getConnection("jdbc:h2:file:" + dir.resolve("db").toAbsolutePath(), "sa", "");
                 Reader script = new InputStreamReader(
                         SchemaUpgradeTest.class.getResourceAsStream("/schema/phase1.sql"), StandardCharsets.UTF_8)) {
                RunScript.execute(c, script);
            }
            return dir;
        } catch (IOException | SQLException e) {
            throw new IllegalStateException(e);
        }
    }
}
