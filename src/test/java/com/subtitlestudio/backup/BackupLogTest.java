package com.subtitlestudio.backup;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class BackupLogTest {

    @TempDir
    Path dir;

    private final Clock clock = Clock.fixed(Instant.parse("2026-11-18T05:30:15.987Z"), ZoneOffset.UTC);

    @Test
    void appendsScriptFormat() throws IOException {
        Path file = dir.resolve("backups/backup.log");
        var log = new BackupLog(file, clock);

        log.ok("ss-20261118-123015.dmp", 14_532_608L);
        log.failed("Database export failed (ORA-39001).");

        assertThat(Files.readAllLines(file)).containsExactly(
                "2026-11-18T12:30:15+07:00 OK ss-20261118-123015.dmp 13.9 MB",
                "2026-11-18T12:30:15+07:00 FAILED Database export failed (ORA-39001).");
    }

    @Test
    void parsesScriptWrittenLines() throws IOException {
        Path file = dir.resolve("backup.log");
        Files.writeString(file, "2026-11-18T02:50:38+07:00 OK ss-20261118-024949.dmp 13.5 MB\r\n"
                + "2026-11-18T11:53:36+07:00 FAILED expdp failed: ORA-39002 \r\n", StandardCharsets.UTF_8);

        var last = new BackupLog(file, clock).last();

        assertThat(last.ok()).isFalse();
        assertThat(last.at()).isEqualTo(Instant.parse("2026-11-18T04:53:36Z"));
        assertThat(last.message()).isEqualTo("expdp failed: ORA-39002");
    }

    @Test
    void lastOkLineGivesFileAndSize() throws IOException {
        Path file = dir.resolve("backup.log");
        Files.writeString(file, "2026-11-18T02:50:38+07:00 OK ss-20261118-024949.dmp 13.5 MB\n\n");

        var last = new BackupLog(file, clock).last();

        assertThat(last.ok()).isTrue();
        assertThat(last.message()).isEqualTo("ss-20261118-024949.dmp 13.5 MB");
    }

    @Test
    void missingOrUnreadableLogGivesNull() throws IOException {
        assertThat(new BackupLog(dir.resolve("none.log"), clock).last()).isNull();

        Path garbage = Files.writeString(dir.resolve("garbage.log"), "hello\nnot a log line\n");
        assertThat(new BackupLog(garbage, clock).last()).isNull();
    }
}
