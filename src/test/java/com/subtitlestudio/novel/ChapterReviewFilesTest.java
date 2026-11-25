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
    void newestByKey() throws IOException {
        touch("review-BH--ch-7--2026-11-24.md");
        touch("review-BH--ch-7--2026-11-25.md");
        touch("review-BH--ch-7--2026-11-25-v2.md");
        touch("review-BH--ch-70--2026-11-26.md");
        touch("review-BHX--ch-7--2026-12-01.md");

        assertThat(files().newest("BH", "ch-7")).hasValueSatisfying(
                p -> assertThat(p.getFileName().toString()).isEqualTo("review-BH--ch-7--2026-11-25-v2.md"));
    }

    @Test
    void newestEmptyWhenNoFileOrNoFolder() throws IOException {
        assertThat(files().newest("P", "ch-5")).isEmpty();
        touch("review-P--ch-4--2026-11-23.md");
        assertThat(files().newest("P", "ch-5")).isEmpty();
    }

    @Test
    void patternText() {
        assertThat(ChapterReviewFiles.pattern("TheDebtCalledYou", "ch-5")).isEqualTo("review-TheDebtCalledYou--ch-5--*.md");
    }

    @Test
    void renameMovesEveryVersion() throws IOException {
        touch("review-BH--ch-7--2026-11-24.md");
        touch("review-BH--ch-7--2026-11-25.md");
        touch("review-BH--ch-7--2026-11-25-v2.md");
        touch("review-BH--ch-70--2026-11-26.md");

        files().rename("BH", "ch-7", "ch-8");

        assertThat(names(root.resolve("reviews"))).containsExactly("review-BH--ch-70--2026-11-26.md",
                "review-BH--ch-8--2026-11-24.md", "review-BH--ch-8--2026-11-25-v2.md",
                "review-BH--ch-8--2026-11-25.md");
    }

    @Test
    void renameNeverOverwrites() throws IOException {
        write("review-BH--ch-8--2026-11-25.md", "target");
        write("review-BH--ch-7--2026-11-25.md", "moved");

        files().rename("BH", "ch-7", "ch-8");

        assertThat(read("review-BH--ch-8--2026-11-25.md")).isEqualTo("target");
        assertThat(read("review-BH--ch-8--2026-11-25-v2.md")).isEqualTo("moved");
    }

    @Test
    void renameIgnoresOtherProfilesAndUnmatchedNames() throws IOException {
        touch("review-Q--ch-3--2026-11-01.md");
        touch("notes.md");
        touch("review-P--ch-3--draft.md");

        files().rename("P", "ch-3", "ch-4");

        assertThat(names(root.resolve("reviews"))).containsExactly(
                "notes.md", "review-P--ch-3--draft.md", "review-Q--ch-3--2026-11-01.md");
    }

    @Test
    void archiveByKey() throws IOException {
        touch("review-P--ch-2--2026-11-01.md");
        touch("review-P--ch-2--2026-11-02-v2.md");
        touch("review-P--ch-3--2026-11-01.md");

        files().archive("P", "ch-2");

        assertThat(names(root.resolve("reviews"))).containsExactly("review-P--ch-3--2026-11-01.md");
        assertThat(names(root.resolve("reviews/_archive"))).containsExactly(
                "review-P--ch-2--2026-11-01.md", "review-P--ch-2--2026-11-02-v2.md");

        touch("review-P--ch-2--2026-11-01.md");
        files().archive("P", "ch-2");
        assertThat(names(root.resolve("reviews/_archive"))).contains("review-P--ch-2--2026-11-01-1.md");
    }

    @Test
    void renameProfileRenamesOnlyThatProfile() throws IOException {
        touch("review-Old--ch-1--2026-11-01.md");
        touch("review-Old--nhan-vat--2026-11-01-v2.md");
        touch("review-Older--ch-1--2026-11-01.md");

        files().renameProfile("Old", "New");

        assertThat(names(root.resolve("reviews"))).containsExactly(
                "review-New--ch-1--2026-11-01.md", "review-New--nhan-vat--2026-11-01-v2.md",
                "review-Older--ch-1--2026-11-01.md");
    }

    @Test
    void migrateLegacyRenamesByPosition() throws IOException {
        touch("review-BH-ch-8-2026-11-25.md");
        touch("review-BH-ch-8-2026-11-25-v2.md");
        touch("review-BH-ch-40-2026-11-20.md");

        files().migrateLegacy("BH", Map.of(8, "ch-7"));

        assertThat(names(root.resolve("reviews"))).containsExactly("review-BH--ch-7--2026-11-25-v2.md",
                "review-BH--ch-7--2026-11-25.md", "review-BH-ch-40-2026-11-20.md");
    }
}
