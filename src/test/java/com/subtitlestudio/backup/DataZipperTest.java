package com.subtitlestudio.backup;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipFile;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DataZipperTest {

    @TempDir
    Path data;

    private final DataZipper zipper = new DataZipper();

    private Path write(String relative, String content) throws IOException {
        Path file = data.resolve(relative);
        Files.createDirectories(file.getParent());
        return Files.writeString(file, content);
    }

    private static List<String> entries(Path zip) throws IOException {
        List<String> names = new ArrayList<>();
        try (ZipFile file = new ZipFile(zip.toFile())) {
            file.stream().forEach(e -> names.add(e.getName()));
        }
        return names;
    }

    @Test
    void zipsEverythingExceptExcluded() throws IOException {
        write("media/a.jpg", "jpg");
        write("prompts/novels/x.md", "profile");
        write("subs/1.vtt", "vtt");
        write("backups/old.dmp", "dump");
        write("backups/backup.log", "log");
        write("logs/app.log", "log");
        write("translate-partial/v.json", "{}");
        write("novel-render/1/x.png", "png");
        write("dev.mv.db", "h2");
        write("dev.trace.db", "h2");
        write("prompts/logs/keep.txt", "a folder named logs deeper down is kept");

        Path zip = zipper.zip(data, data.resolve("backups"), "data-20261118-120000");

        assertThat(zip).isEqualTo(data.resolve("backups/data-20261118-120000.zip"));
        assertThat(entries(zip)).containsExactlyInAnyOrder("media/a.jpg", "prompts/novels/x.md", "subs/1.vtt",
                "prompts/logs/keep.txt");
    }

    @Test
    void writesPartThenRenames() throws IOException {
        write("subs/1.vtt", "vtt");

        zipper.zip(data, data.resolve("backups"), "data-20261118-120000");

        try (var files = Files.list(data.resolve("backups"))) {
            assertThat(files.map(p -> p.getFileName().toString())).containsExactly("data-20261118-120000.zip");
        }
    }

    @Test
    void zipHoldsTheFileContent() throws IOException {
        write("subs/1.vtt", "Tiếng Việt có dấu");

        Path zip = zipper.zip(data, data.resolve("backups"), "data-20261118-120000");

        try (ZipFile file = new ZipFile(zip.toFile())) {
            var entry = file.getEntry("subs/1.vtt");
            assertThat(new String(file.getInputStream(entry).readAllBytes(), java.nio.charset.StandardCharsets.UTF_8))
                    .isEqualTo("Tiếng Việt có dấu");
        }
    }

    @Test
    void retentionKeepsNewest() throws IOException {
        Path backups = Files.createDirectories(data.resolve("backups"));
        for (int day = 10; day <= 18; day++) {
            Files.writeString(backups.resolve("data-202611" + day + "-120000.zip"), "z");
        }

        DataZipper.prune(backups, "data-", ".zip", 7);

        try (var files = Files.list(backups)) {
            assertThat(files.map(p -> p.getFileName().toString()).sorted()).containsExactly(
                    "data-20261112-120000.zip", "data-20261113-120000.zip", "data-20261114-120000.zip",
                    "data-20261115-120000.zip", "data-20261116-120000.zip", "data-20261117-120000.zip",
                    "data-20261118-120000.zip");
        }
    }

    @Test
    void retentionTouchesOnlyOwnFiles() throws IOException {
        Path backups = Files.createDirectories(data.resolve("backups"));
        Files.writeString(backups.resolve("backup.log"), "log");
        Files.writeString(backups.resolve("notes.txt"), "mine");
        Files.writeString(backups.resolve("data-20261101-120000.zip.part"), "running");
        Files.writeString(backups.resolve("data-old.zip"), "not ours: no timestamp");
        Files.writeString(backups.resolve("ss-20261101-120000.dmp"), "a dump is not a zip");
        Files.writeString(backups.resolve("data-20261101-120000.zip"), "old");
        Files.writeString(backups.resolve("data-20261102-120000.zip"), "new");

        DataZipper.prune(backups, "data-", ".zip", 1);

        try (var files = Files.list(backups)) {
            assertThat(files.map(p -> p.getFileName().toString()).sorted()).containsExactly("backup.log",
                    "data-20261101-120000.zip.part", "data-20261102-120000.zip", "data-old.zip", "notes.txt",
                    "ss-20261101-120000.dmp");
        }
    }

    @Test
    void pruneDumpRemovesPairedLog() throws IOException {
        Path backups = Files.createDirectories(data.resolve("backups"));
        Files.writeString(backups.resolve("ss-20261101-120000.dmp"), "old");
        Files.writeString(backups.resolve("ss-20261101-120000.log"), "old log");
        Files.writeString(backups.resolve("ss-20261102-120000.dmp"), "new");
        Files.writeString(backups.resolve("ss-20261102-120000.log"), "new log");

        DataZipper.prune(backups, "ss-", ".dmp", 1);

        try (var files = Files.list(backups)) {
            assertThat(files.map(p -> p.getFileName().toString()).sorted())
                    .containsExactly("ss-20261102-120000.dmp", "ss-20261102-120000.log");
        }
    }

    @Test
    void pruneOfAMissingFolderDoesNothing() throws IOException {
        DataZipper.prune(data.resolve("nope"), "data-", ".zip", 7);
    }
}
