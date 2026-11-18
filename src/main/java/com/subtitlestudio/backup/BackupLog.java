package com.subtitlestudio.backup;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * {@code data/backups/backup.log}, the file {@code scripts/backup-db.ps1} also writes: one line per backup part,
 * {@code <ISO time with offset> OK <file> <MB> MB} or {@code <ISO time with offset> FAILED <reason>}.
 */
@Component
public class BackupLog {

    /** The result of the latest run: when it ended, whether it worked, and the file or the reason. */
    public record LastRun(Instant at, boolean ok, String message) {
    }

    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final Pattern LINE = Pattern.compile("^(\\S+)\\s+(OK|FAILED)\\s*(.*)$");

    private final Path file;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public BackupLog(SubtitleStudioProperties properties, Clock clock) {
        this(properties.dataDir().resolve("backups").resolve("backup.log"), clock);
    }

    BackupLog(Path file, Clock clock) {
        this.file = file;
        this.clock = clock;
    }

    public void ok(String fileName, long bytes) {
        append("OK " + fileName + " " + String.format(Locale.ROOT, "%.1f", bytes / 1024.0 / 1024.0) + " MB");
    }

    public void failed(String reason) {
        append("FAILED " + reason.replace('\n', ' ').replace('\r', ' '));
    }

    private synchronized void append(String text) {
        String time = OffsetDateTime.ofInstant(clock.instant().truncatedTo(ChronoUnit.SECONDS), ZONE).toString();
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, time + " " + text + System.lineSeparator(), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            // The log is a convenience: a backup that worked is not turned into a failure because the log is locked.
            org.slf4j.LoggerFactory.getLogger(BackupLog.class).warn("Could not write backup.log: {}",
                    e.getClass().getSimpleName());
        }
    }

    /** The last line of the log (also lines the script wrote), or null when there is no readable one. */
    public synchronized LastRun last() {
        List<String> lines;
        try {
            if (!Files.isRegularFile(file)) {
                return null;
            }
            lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        } catch (IOException | RuntimeException e) {
            return null;
        }
        for (int i = lines.size() - 1; i >= 0; i--) {
            Matcher m = LINE.matcher(lines.get(i).strip().replace("﻿", ""));
            if (!m.matches()) {
                continue;
            }
            try {
                return new LastRun(OffsetDateTime.parse(m.group(1)).toInstant(), "OK".equals(m.group(2)),
                        m.group(3));
            } catch (java.time.format.DateTimeParseException e) {
                return null;
            }
        }
        return null;
    }
}
