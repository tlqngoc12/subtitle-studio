package com.subtitlestudio.backup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class BackupServiceTest {

    /** 2026-11-18 12:00:00 in Vietnam. */
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-18T05:00:00Z"), ZoneOffset.UTC);

    @TempDir
    Path data;

    private Path backups;
    private DbExporter exporter;
    private DataZipper zipper;
    private BackupLog backupLog;

    @BeforeEach
    void setUp() throws IOException {
        backups = Files.createDirectories(data.resolve("backups"));
        exporter = mock(DbExporter.class);
        zipper = new DataZipper();
        backupLog = new BackupLog(backups.resolve("backup.log"), clock);
        Files.writeString(data.resolve("note.txt"), "something to zip");
    }

    private BackupService service(java.util.concurrent.Executor executor) {
        var properties = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), data,
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                        List.of()),
                new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
        return new BackupService(exporter, zipper, backupLog, properties, clock, executor);
    }

    private BackupService inline() {
        return service(Runnable::run);
    }

    private void exportWritesDump() {
        when(exporter.supported()).thenReturn(true);
        when(exporter.export(anyString())).thenAnswer(call -> {
            String name = call.getArgument(0);
            Files.writeString(backups.resolve(name + ".dmp"), "dump");
            Files.writeString(backups.resolve(name + ".log"), "dump log");
            return 4L;
        });
    }

    private List<String> backupFiles() throws IOException {
        try (var files = Files.list(backups)) {
            return files.map(p -> p.getFileName().toString()).sorted().toList();
        }
    }

    @Test
    void runsDbThenZipThenPrunes() throws IOException {
        exportWritesDump();
        for (int day = 1; day <= 16; day++) {
            String stamp = String.format("202611%02d-120000", day);
            Files.writeString(backups.resolve("ss-" + stamp + ".dmp"), "old");
            Files.writeString(backups.resolve("ss-" + stamp + ".log"), "old");
            Files.writeString(backups.resolve("data-" + stamp + ".zip"), "old");
        }
        var service = inline();

        assertThat(service.start()).isTrue();

        assertThat(backupFiles()).contains("ss-20261118-120000.dmp", "ss-20261118-120000.log",
                "data-20261118-120000.zip", "backup.log");
        assertThat(backupFiles().stream().filter(n -> n.endsWith(".dmp")).count()).isEqualTo(14);
        assertThat(backupFiles().stream().filter(n -> n.endsWith(".zip")).count()).isEqualTo(7);
        assertThat(backupFiles()).doesNotContain("ss-20261101-120000.dmp", "ss-20261101-120000.log",
                "data-20261101-120000.zip");
        var status = service.status();
        assertThat(status.running()).isFalse();
        assertThat(status.last().ok()).isTrue();
        assertThat(Files.readAllLines(backups.resolve("backup.log"))).hasSize(2)
                .allSatisfy(line -> assertThat(line).contains(" OK "));
    }

    @Test
    void dbFailureStillZipsAndReportsFailed() throws IOException {
        when(exporter.supported()).thenReturn(true);
        when(exporter.export(anyString())).thenThrow(new DbExporter.DbExportException("Database export failed (ORA-39001)."));
        var service = inline();

        service.start();

        assertThat(backupFiles()).contains("data-20261118-120000.zip");
        var last = service.status().last();
        assertThat(last.ok()).isFalse();
        assertThat(last.message()).contains("ORA-39001").contains("Saved data files");
        assertThat(Files.readString(backups.resolve("backup.log"))).contains("FAILED Database export failed (ORA-39001).")
                .contains(" OK data-20261118-120000.zip ");
    }

    @Test
    void h2SkipsDbWithMessage() throws IOException {
        when(exporter.supported()).thenReturn(false);
        var service = inline();

        service.start();

        verify(exporter, never()).export(anyString());
        assertThat(backupFiles()).contains("data-20261118-120000.zip");
        assertThat(service.status().last().message()).startsWith("Database backup needs Oracle");
        assertThat(Files.readString(backups.resolve("backup.log"))).contains("FAILED Database backup needs Oracle");
    }

    @Test
    void secondRunIsRejectedWhileRunning() throws Exception {
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(exporter.supported()).thenReturn(true);
        when(exporter.export(anyString())).thenAnswer(call -> {
            started.countDown();
            release.await(10, TimeUnit.SECONDS);
            return 1L;
        });
        var service = service(task -> new Thread(task).start());

        assertThat(service.start()).isTrue();
        assertThat(started.await(10, TimeUnit.SECONDS)).isTrue();

        assertThat(service.status().running()).isTrue();
        assertThat(service.start()).isFalse();

        release.countDown();
        awaitIdle(service);
        assertThat(service.start()).isTrue();
        awaitIdle(service); // the temp folder must not be deleted under a run that is still writing
    }

    private static void awaitIdle(BackupService service) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (service.status().running() && System.nanoTime() < deadline) {
            Thread.sleep(20);
        }
        assertThat(service.status().running()).isFalse();
    }

    @Test
    void anUnexpectedErrorEndsTheRunAndFreesTheLock() {
        when(exporter.supported()).thenThrow(new IllegalStateException("boom"));
        var service = inline();

        service.start();

        assertThat(service.status().running()).isFalse();
        assertThat(service.status().last().ok()).isFalse();
        assertThat(service.start()).isTrue();
    }

    @Test
    void listsItemsNewestFirst() throws IOException {
        Files.writeString(backups.resolve("ss-20261116-120000.dmp"), "dump16");
        Files.writeString(backups.resolve("data-20261117-120000.zip"), "zip17");
        Files.writeString(backups.resolve("ss-20261117-120000.dmp"), "dump17");
        Files.writeString(backups.resolve("ss-20261117-120000.log"), "log");
        Files.writeString(backups.resolve("backup.log"), "log");
        Files.writeString(backups.resolve("notes.txt"), "mine");

        var items = inline().status().items();

        assertThat(items).extracting(BackupService.Item::name).containsExactly("ss-20261117-120000.dmp",
                "data-20261117-120000.zip", "ss-20261116-120000.dmp");
        assertThat(items.get(0).kind()).isEqualTo(BackupService.Kind.DATABASE);
        assertThat(items.get(1).kind()).isEqualTo(BackupService.Kind.DATA);
        assertThat(items.get(0).sizeBytes()).isEqualTo(6);
        assertThat(items.get(0).createdAt()).isEqualTo(Instant.parse("2026-11-17T05:00:00Z"));
    }
}
