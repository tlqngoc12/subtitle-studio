package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.PromptProfileStore;
import com.subtitlestudio.translate.UnknownProfileException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class NovelProfileStoreTest {

    @TempDir
    Path dataDir;

    private SubtitleStudioProperties properties() {
        return new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir,
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                        List.of()),
                new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
    }

    private void write(String relative, String text) throws IOException {
        Path file = dataDir.resolve(relative);
        Files.createDirectories(file.getParent());
        Files.writeString(file, text);
    }

    @Test
    void novelProfilesLiveInTheirOwnFolder() throws IOException {
        write("prompts/EmiBonnie.md", "vlog");
        write("prompts/novels/BeMySugar.md", "Ngôn ngữ gốc: tiếng Thái");
        SubtitleStudioProperties p = properties();
        PromptProfileStore vietsub = new PromptProfileStore(p);
        NovelProfileStore novels = new NovelProfileStore(p, vietsub);

        assertThat(novels.list()).containsExactly("BeMySugar");
        assertThat(vietsub.list()).containsExactly("EmiBonnie");
        assertThat(novels.read("BeMySugar")).isEqualTo("Ngôn ngữ gốc: tiếng Thái");
        assertThatThrownBy(() -> novels.read("EmiBonnie")).isInstanceOf(UnknownProfileException.class);
        assertThatThrownBy(() -> vietsub.read("BeMySugar")).isInstanceOf(UnknownProfileException.class);
    }

    @Test
    void firstStartInstallsBothExamples() {
        SubtitleStudioProperties p = properties();
        NovelProfileStore novels = new NovelProfileStore(p, new PromptProfileStore(p));

        novels.installExampleIfMissing();

        assertThat(dataDir.resolve("prompts/_example.md")).exists();
        assertThat(dataDir.resolve("prompts/novels/_example.md")).exists()
                .content().contains("Ngôn ngữ gốc");
    }

    @Test
    void existingSetupGetsTheNovelExampleToo() throws IOException {
        write("prompts/EmiBonnie.md", "vlog");
        SubtitleStudioProperties p = properties();
        NovelProfileStore novels = new NovelProfileStore(p, new PromptProfileStore(p));

        novels.installExampleIfMissing();

        assertThat(dataDir.resolve("prompts/novels/_example.md")).exists();
        assertThat(dataDir.resolve("prompts/_example.md")).doesNotExist();
    }

    @Test
    void createExistsAndDeleteGoThroughTheNovelFolder() {
        SubtitleStudioProperties p = properties();
        NovelProfileStore novels = new NovelProfileStore(p, new PromptProfileStore(p));

        novels.create("MoonShadow", "Hồ sơ mới");

        assertThat(dataDir.resolve("prompts/novels/MoonShadow.md")).exists().content().isEqualTo("Hồ sơ mới");
        assertThat(novels.exists("MoonShadow")).isTrue();
        assertThat(novels.list()).contains("MoonShadow");

        novels.delete("MoonShadow");

        assertThat(novels.exists("MoonShadow")).isFalse();
    }

    @Test
    void writeKeepsHistoryAndChecksSha() throws IOException {
        write("prompts/novels/MoonShadow.md", "old");
        SubtitleStudioProperties p = properties();
        NovelProfileStore novels = new NovelProfileStore(p, new PromptProfileStore(p));
        String sha = novels.sha("MoonShadow");

        String next = novels.write("MoonShadow", "new text", sha);

        assertThat(novels.read("MoonShadow")).isEqualTo("new text");
        assertThat(next).isEqualTo(novels.sha("MoonShadow")).isNotEqualTo(sha);
        try (var history = Files.list(dataDir.resolve("prompts/novels/.history"))) {
            assertThat(history.toList()).singleElement().satisfies(f -> {
                assertThat(f.getFileName().toString()).startsWith("MoonShadow-").endsWith(".md");
                assertThat(f).hasContent("old");
            });
        }
        assertThatThrownBy(() -> novels.write("MoonShadow", "again", sha))
                .isInstanceOf(com.subtitlestudio.translate.ProfileChangedException.class);
        assertThat(novels.read("MoonShadow")).isEqualTo("new text");
    }

    @Test
    void renameDelegatesToTheNovelFolder() throws IOException {
        write("prompts/novels/Unknown.md", "# Hồ sơ dịch: Unknown");
        SubtitleStudioProperties p = properties();
        NovelProfileStore store = new NovelProfileStore(p, new PromptProfileStore(p));

        store.rename("Unknown", "MuaHe", t -> t.replace("Unknown", "Mua He"));

        assertThat(store.exists("Unknown")).isFalse();
        assertThat(store.read("MuaHe")).isEqualTo("# Hồ sơ dịch: Mua He");
    }
}
