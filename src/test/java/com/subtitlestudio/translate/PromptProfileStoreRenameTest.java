package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PromptProfileStoreRenameTest {

    @TempDir
    private Path root;

    private Path prompts;
    private PromptProfileStore store;

    @BeforeEach
    void setUp() throws IOException {
        prompts = Files.createDirectories(root.resolve("prompts"));
        store = new PromptProfileStore(prompts);
    }

    private void file(String relative, String text) throws IOException {
        Path file = prompts.resolve(relative);
        Files.createDirectories(file.getParent());
        Files.writeString(file, text, StandardCharsets.UTF_8);
    }

    private List<String> historyNames() throws IOException {
        Path history = prompts.resolve(".history");
        if (!Files.isDirectory(history)) {
            return List.of();
        }
        try (Stream<Path> files = Files.list(history)) {
            return files.map(p -> p.getFileName().toString()).sorted().toList();
        }
    }

    @Test
    void renameMovesFileAndOnlyItsHistory() throws IOException {
        file("A.md", "a text");
        file(".history/A-20261118-101010.md", "h1");
        file(".history/A-20261118-101010-2.md", "h2");
        file(".history/A-2-20261118-101010.md", "other");
        file(".history/AB-20261118-101010.md", "other2");

        store.rename("A", "B", t -> t);

        assertThat(prompts.resolve("A.md")).doesNotExist();
        assertThat(Files.readString(prompts.resolve("B.md"), StandardCharsets.UTF_8)).isEqualTo("a text");
        assertThat(historyNames()).containsExactly("A-2-20261118-101010.md", "AB-20261118-101010.md",
                "B-20261118-101010-2.md", "B-20261118-101010.md");
        assertThat(Files.readString(prompts.resolve(".history/B-20261118-101010.md"))).isEqualTo("h1");
    }

    @Test
    void renameAppliesEditWithoutHistoryEntry() throws IOException {
        file("A.md", "title: A");

        store.rename("A", "B", t -> t.replace("A", "B"));

        assertThat(Files.readString(prompts.resolve("B.md"), StandardCharsets.UTF_8)).isEqualTo("title: B");
        assertThat(historyNames()).isEmpty();
    }

    @Test
    void renameToSameNameRewritesInPlace() throws IOException {
        file("A.md", "old");
        file(".history/A-20261118-101010.md", "h1");

        store.rename("A", "A", t -> "new");

        assertThat(Files.readString(prompts.resolve("A.md"), StandardCharsets.UTF_8)).isEqualTo("new");
        assertThat(historyNames()).containsExactly("A-20261118-101010.md");
    }

    @Test
    void renameRefusesExistingTarget() throws IOException {
        file("A.md", "a");
        file("B.md", "b");

        assertThatThrownBy(() -> store.rename("A", "B", t -> t)).isInstanceOf(ProfileExistsException.class);
        assertThat(Files.readString(prompts.resolve("A.md"))).isEqualTo("a");
        assertThat(Files.readString(prompts.resolve("B.md"))).isEqualTo("b");
    }

    @Test
    void renameRefusesTheReservedWritingRulesName() throws IOException {
        file("A.md", "text");
        assertThatThrownBy(() -> store.rename("A", "writing-rules", t -> t)).isInstanceOf(InvalidProfileTextException.class);
        assertThat(prompts.resolve("A.md")).exists();
        assertThat(prompts.resolve("writing-rules.md")).doesNotExist();
    }

    @Test
    void renameRefusesMissingSource() {
        assertThatThrownBy(() -> store.rename("A", "B", t -> t)).isInstanceOf(UnknownProfileException.class);
    }

    @Test
    void renameCaseOnly() throws IOException {
        file("a.md", "text");
        file(".history/a-20261118-101010.md", "h1");

        store.rename("a", "A", t -> t);

        try (Stream<Path> files = Files.list(prompts)) {
            assertThat(files.map(p -> p.getFileName().toString()).filter(n -> n.endsWith(".md")).toList())
                    .containsExactly("A.md");
        }
        assertThat(Files.readString(prompts.resolve("A.md"))).isEqualTo("text");
        assertThat(historyNames()).containsExactly("A-20261118-101010.md");
    }
}
