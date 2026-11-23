package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ChapterReviewFilesTest {

    @TempDir
    Path root;

    private Path dir() throws IOException {
        return Files.createDirectories(root.resolve("reviews"));
    }

    private void touch(String name) throws IOException {
        write(name, "x");
    }

    private void write(String name, String text) throws IOException {
        Files.writeString(dir().resolve(name), text, StandardCharsets.UTF_8);
    }

    private String read(String relative) throws IOException {
        return Files.readString(root.resolve("reviews").resolve(relative), StandardCharsets.UTF_8);
    }

    private List<String> names(Path folder) throws IOException {
        try (Stream<Path> s = Files.list(folder)) {
            return s.filter(Files::isRegularFile).map(p -> p.getFileName().toString()).sorted().toList();
        }
    }

    private ChapterReviewFiles files() {
        return new ChapterReviewFiles(root.resolve("reviews"));
    }

    @Test
    void newestPicksLatestDateThenVersion() throws IOException {
        touch("review-P-ch-5-2026-11-20.md");
        touch("review-P-ch-5-2026-11-23.md");
        touch("review-P-ch-5-2026-11-23-v2.md");
        touch("review-P-ch-5-2026-11-23-v10.md");
        touch("review-P-ch-50-2026-12-01.md");
        touch("review-PX-ch-5-2026-12-01.md");

        assertThat(files().newest("P", 5)).hasValueSatisfying(
                p -> assertThat(p.getFileName().toString()).isEqualTo("review-P-ch-5-2026-11-23-v10.md"));
    }

    @Test
    void newestEmptyWhenNoFileOrNoFolder() throws IOException {
        assertThat(files().newest("P", 5)).isEmpty();
        touch("review-P-ch-4-2026-11-23.md");
        assertThat(files().newest("P", 5)).isEmpty();
    }

    @Test
    void patternText() {
        assertThat(ChapterReviewFiles.pattern("TheDebtCalledYou", 5)).isEqualTo("review-TheDebtCalledYou-ch-5-*.md");
    }

    @Test
    void renumberSwapsWithoutOverwriting() throws IOException {
        write("review-P-ch-3-2026-11-01.md", "three");
        write("review-P-ch-5-2026-11-01.md", "five");
        write("review-P-ch-5-2026-11-02-v2.md", "five2");

        files().renumber("P", Map.of(3, 5, 5, 3));

        assertThat(read("review-P-ch-5-2026-11-01.md")).isEqualTo("three");
        assertThat(read("review-P-ch-3-2026-11-01.md")).isEqualTo("five");
        assertThat(names(root.resolve("reviews"))).containsExactly(
                "review-P-ch-3-2026-11-01.md", "review-P-ch-3-2026-11-02-v2.md", "review-P-ch-5-2026-11-01.md");
    }

    @Test
    void renumberIgnoresOtherProfilesAndUnmatchedNames() throws IOException {
        touch("review-Q-ch-3-2026-11-01.md");
        touch("notes.md");
        touch("review-P-ch-3-draft.md");

        files().renumber("P", Map.of(3, 4));

        assertThat(names(root.resolve("reviews"))).containsExactly(
                "notes.md", "review-P-ch-3-draft.md", "review-Q-ch-3-2026-11-01.md");
    }

    @Test
    void archiveMovesAllVersions() throws IOException {
        touch("review-P-ch-2-2026-11-01.md");
        touch("review-P-ch-2-2026-11-02-v2.md");
        touch("review-P-ch-3-2026-11-01.md");

        files().archive("P", 2);

        assertThat(names(root.resolve("reviews"))).containsExactly("review-P-ch-3-2026-11-01.md");
        assertThat(names(root.resolve("reviews/_archive"))).containsExactly(
                "review-P-ch-2-2026-11-01.md", "review-P-ch-2-2026-11-02-v2.md");

        touch("review-P-ch-2-2026-11-01.md");
        files().archive("P", 2);
        assertThat(names(root.resolve("reviews/_archive"))).contains("review-P-ch-2-2026-11-01-1.md");
    }

    @Test
    void renameProfileRenamesOnlyThatProfile() throws IOException {
        touch("review-Old-ch-1-2026-11-01.md");
        touch("review-Old-ch-12-2026-11-01-v2.md");
        touch("review-Older-ch-1-2026-11-01.md");

        files().renameProfile("Old", "New");

        assertThat(names(root.resolve("reviews"))).containsExactly(
                "review-New-ch-1-2026-11-01.md", "review-New-ch-12-2026-11-01-v2.md", "review-Older-ch-1-2026-11-01.md");
    }
}
