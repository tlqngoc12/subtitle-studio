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

class PagesFunctionsTest {

    private static final String TOKEN = "cf-secret-123";

    @TempDir
    Path root;

    private PagesFunctions functions(String project, String d1) {
        var props = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), root.resolve("data"),
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3, List.of()),
                new SubtitleStudioProperties.Publish(TOKEN, "acc", project, false, "wrangler", Duration.ofMinutes(5), d1));
        return new PagesFunctions(props);
    }

    private PagesFunctions r2Functions(String d1, String bucket) {
        var props = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), root.resolve("data"),
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3, List.of()),
                new SubtitleStudioProperties.Publish(TOKEN, "acc", "fans", false, "wrangler", Duration.ofMinutes(5), d1,
                        bucket, "AKID-xyz", "SECRET-xyz"));
        return new PagesFunctions(props);
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

    @Test
    void r2OnlyWritesBucketBindingAndImageFunction() throws IOException {
        r2Functions("", "novel-imgs").prepare(site());

        assertThat(root.resolve("wrangler.toml")).content()
                .contains("[[r2_buckets]]", "binding = \"NOVEL_IMAGES\"", "bucket_name = \"novel-imgs\"")
                .doesNotContain("d1_databases").doesNotContain("SECRET").doesNotContain("AKID").doesNotContain(TOKEN);
        assertThat(root.resolve("functions/novel-images/[[path]].js")).content()
                .contains("NOVEL_IMAGES").contains("immutable");
        assertThat(root.resolve("functions/api/reads")).doesNotExist();
    }

    @Test
    void readCountsAndR2BothWritten() throws IOException {
        r2Functions("d1-id-123", "novel-imgs").prepare(site());

        assertThat(root.resolve("wrangler.toml")).content().contains("[[d1_databases]]", "[[r2_buckets]]");
        assertThat(root.resolve("functions/api/reads/index.js")).exists();
        assertThat(root.resolve("functions/novel-images/[[path]].js")).exists();
    }

    @Test
    void neitherWritesNothing() throws IOException {
        r2Functions("", "").prepare(site());

        assertThat(root.resolve("wrangler.toml")).doesNotExist();
        assertThat(root.resolve("functions")).doesNotExist();
        assertThat(root.resolve("abc-123/_routes.json")).doesNotExist();
    }

    @Test
    void routesJsonListsOnlyEnabledFunctions() throws IOException {
        r2Functions("d1-id-123", "").prepare(site());
        assertThat(root.resolve("abc-123/_routes.json")).content()
                .contains("\"/api/reads\"", "\"/api/reads/*\"").doesNotContain("novel-images").doesNotContain("\"/*\"");

        r2Functions("", "novel-imgs").prepare(site());
        assertThat(root.resolve("abc-123/_routes.json")).content()
                .contains("\"/novel-images/*\"").doesNotContain("api/reads").doesNotContain("\"/*\"")
                .contains("\"version\":1").contains("\"exclude\":[]");

        r2Functions("d1-id-123", "novel-imgs").prepare(site());
        assertThat(root.resolve("abc-123/_routes.json")).content()
                .contains("\"/api/reads\"", "\"/api/reads/*\"", "\"/novel-images/*\"").doesNotContain("\"/*\"");

        r2Functions("", "").prepare(site());
        assertThat(root.resolve("abc-123/_routes.json")).doesNotExist();
    }

    @Test
    void refusesUnsafeBucketName() {
        assertThatThrownBy(() -> r2Functions("", "x\"\n[evil]").prepare(site())).isInstanceOf(IllegalStateException.class);
    }
}
