package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReadCountsFunctionsTest {

    private static final String TOKEN = "cf-secret-123";

    @TempDir
    Path root;

    private ReadCountsFunctions functions(String project, String d1) {
        var props = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), root.resolve("data"),
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3, List.of()),
                new SubtitleStudioProperties.Publish(TOKEN, "acc", project, false, "wrangler", Duration.ofMinutes(5), d1));
        return new ReadCountsFunctions(props);
    }

    private Path site() throws IOException {
        return Files.createDirectories(root.resolve("abc-123"));
    }

    @Test
    void writesFunctionsAndConfigInTheSiteParent() throws IOException {
        functions("fans", "d1-id-123").prepare(site());

        assertThat(root.resolve("functions/api/reads/index.js")).content().contains("onRequestGet");
        assertThat(root.resolve("functions/api/reads/[slug].js")).content().contains("onRequestPost").contains("/data/novels.json");
        assertThat(root.resolve("wrangler.toml")).content()
                .contains("name = \"fans\"", "pages_build_output_dir = \"abc-123\"", "[[d1_databases]]",
                        "binding = \"READS\"", "database_name = \"novel-reads\"", "database_id = \"d1-id-123\"")
                .doesNotContain(TOKEN);
    }

    @Test
    void writesNothingWhenD1IsBlank() throws IOException {
        functions("fans", "  ").prepare(site());

        assertThat(root.resolve("functions")).doesNotExist();
        assertThat(root.resolve("wrangler.toml")).doesNotExist();
    }

    @Test
    void removesStaleFilesWhenOff() throws IOException {
        Files.createDirectories(root.resolve("functions/api"));
        Files.writeString(root.resolve("functions/api/old.js"), "x");
        Files.writeString(root.resolve("wrangler.toml"), "stale");

        functions("fans", "").prepare(site());

        assertThat(root.resolve("functions")).doesNotExist();
        assertThat(root.resolve("wrangler.toml")).doesNotExist();
    }

    @Test
    void overwritesStaleFilesWhenOn() throws IOException {
        Files.createDirectories(root.resolve("functions/api"));
        Files.writeString(root.resolve("functions/api/old.js"), "x");

        functions("fans", "d1-id-123").prepare(site());

        assertThat(root.resolve("functions/api/old.js")).doesNotExist();
        assertThat(root.resolve("functions/api/reads/index.js")).exists();
    }

    @Test
    void refusesValuesThatCouldBreakTheToml() throws IOException {
        assertThatThrownBy(() -> functions("fans", "x\"\n[evil]").prepare(site())).isInstanceOf(IllegalStateException.class);
    }
}
