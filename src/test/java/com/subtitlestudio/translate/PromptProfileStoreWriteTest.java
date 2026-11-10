package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PromptProfileStoreWriteTest {

    @TempDir
    private Path root;

    private Path prompts;
    private PromptProfileStore store;

    @BeforeEach
    void setUp() throws IOException {
        prompts = Files.createDirectories(root.resolve("prompts"));
        Files.writeString(prompts.resolve("EmiBonnie.md"), "cũ", StandardCharsets.UTF_8);
        store = new PromptProfileStore(prompts);
    }

    @Test
    void shaIsTheSha256OfTheUtf8Text() {
        assertThat(store.sha("EmiBonnie")).isEqualTo(PromptProfileStore.sha256("cũ"))
                .hasSize(64).matches("[0-9a-f]+");
        assertThat(PromptProfileStore.sha256("")).isEqualTo(
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    }

    @Test
    void writesTheNewTextKeepsABackupAndReturnsTheNewSha() throws IOException {
        String sha = store.write("EmiBonnie", "mới ✓", store.sha("EmiBonnie"));

        assertThat(Files.readString(prompts.resolve("EmiBonnie.md"), StandardCharsets.UTF_8)).isEqualTo("mới ✓");
        assertThat(sha).isEqualTo(PromptProfileStore.sha256("mới ✓")).isEqualTo(store.sha("EmiBonnie"));
        try (Stream<Path> history = Files.list(prompts.resolve(".history"))) {
            assertThat(history).singleElement().satisfies(backup -> {
                assertThat(backup.getFileName().toString()).startsWith("EmiBonnie-").endsWith(".md");
                assertThat(Files.readString(backup, StandardCharsets.UTF_8)).isEqualTo("cũ");
            });
        }
    }

    @Test
    void leavesNoTempFileAndTheBackupIsNotListedAsAProfile() throws IOException {
        store.write("EmiBonnie", "mới", store.sha("EmiBonnie"));

        try (Stream<Path> files = Files.list(prompts)) {
            assertThat(files.map(p -> p.getFileName().toString())).containsExactlyInAnyOrder("EmiBonnie.md", ".history");
        }
        assertThat(store.list()).containsExactly("EmiBonnie");
    }

    @Test
    void twoSavesInTheSameSecondKeepTwoBackups() throws IOException {
        String sha = store.write("EmiBonnie", "một", store.sha("EmiBonnie"));
        store.write("EmiBonnie", "hai", sha);

        try (Stream<Path> history = Files.list(prompts.resolve(".history"))) {
            assertThat(history).hasSize(2);
        }
    }

    @Test
    void rejectsAStaleBaseShaWithoutTouchingTheFile() throws IOException {
        assertThatThrownBy(() -> store.write("EmiBonnie", "mới", PromptProfileStore.sha256("khác")))
                .isInstanceOf(ProfileChangedException.class);

        assertThat(Files.readString(prompts.resolve("EmiBonnie.md"), StandardCharsets.UTF_8)).isEqualTo("cũ");
        assertThat(prompts.resolve(".history")).doesNotExist();
    }

    @Test
    void rejectsEmptyAndTooLargeText() {
        String sha = store.sha("EmiBonnie");
        assertThatThrownBy(() -> store.write("EmiBonnie", "  \n", sha)).isInstanceOf(InvalidProfileTextException.class);
        assertThatThrownBy(() -> store.write("EmiBonnie", null, sha)).isInstanceOf(InvalidProfileTextException.class);
        assertThatThrownBy(() -> store.write("EmiBonnie", "a".repeat(PromptProfileStore.MAX_BYTES + 1), sha))
                .isInstanceOf(InvalidProfileTextException.class);
        // 20 KB of bytes counts, not characters: "ế" is 3 bytes
        assertThatThrownBy(() -> store.write("EmiBonnie", "ế".repeat(PromptProfileStore.MAX_BYTES / 3 + 1), sha))
                .isInstanceOf(InvalidProfileTextException.class);
        assertThatThrownBy(() -> store.write("EmiBonnie", "bad \ud800 surrogate", sha))
                .isInstanceOf(InvalidProfileTextException.class);
        assertThat(store.write("EmiBonnie", "a".repeat(PromptProfileStore.MAX_BYTES), sha)).isNotBlank();
    }

    @ParameterizedTest
    @ValueSource(strings = {"../x", "_example", "a/b", "", "missing"})
    void rejectsUnknownOrUnsafeNames(String name) {
        assertThatThrownBy(() -> store.write(name, "x", PromptProfileStore.sha256("")))
                .isInstanceOf(UnknownProfileException.class);
        assertThat(root.resolve("x.md")).doesNotExist();
    }
}
