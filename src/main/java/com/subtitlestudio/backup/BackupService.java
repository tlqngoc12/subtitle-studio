package com.subtitlestudio.backup;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * One backup run (manual or daily): a Data Pump dump of the database, a zip of {@code ./data}, then retention. Only
 * one run at a time. The database part never stops the zip: a failure of either part is logged and the run is
 * reported as failed, but the other part still happens.
 */
@Service
public class BackupService {

    /** How many database dumps and data zips are kept. */
    static final int KEEP_DUMPS = 14;
    static final int KEEP_ZIPS = 7;

    public enum Kind { DATABASE, DATA }

    /** One file in {@code data/backups}. */
    public record Item(String name, Kind kind, long sizeBytes, Instant createdAt) {
    }

    public record Status(boolean running, BackupLog.LastRun last, List<Item> items) {
    }

    private static final Logger log = LoggerFactory.getLogger(BackupService.class);
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss", Locale.ROOT);
    private static final Pattern BACKUP_FILE = Pattern.compile("^(ss|data)-(\\d{8}-\\d{6})\\.(dmp|zip)$");

    private final DbExporter exporter;
    private final DataZipper zipper;
    private final BackupLog backupLog;
    private final Path dataDir;
    private final Path backupsDir;
    private final Clock clock;
    private final Executor executor;
    private final AtomicBoolean running = new AtomicBoolean();
    private volatile BackupLog.LastRun lastRun;

    @Autowired
    public BackupService(DbExporter exporter, DataZipper zipper, BackupLog backupLog,
                         SubtitleStudioProperties properties, Clock clock) {
        this(exporter, zipper, backupLog, properties, clock, task -> Thread.ofVirtual().name("backup").start(task));
    }

    /** {@code executor} runs the work; tests pass one that runs it at once or on their own thread. */
    BackupService(DbExporter exporter, DataZipper zipper, BackupLog backupLog, SubtitleStudioProperties properties,
                  Clock clock, Executor executor) {
        this.exporter = exporter;
        this.zipper = zipper;
        this.backupLog = backupLog;
        this.dataDir = properties.dataDir();
        this.backupsDir = properties.dataDir().resolve("backups");
        this.clock = clock;
        this.executor = executor;
    }

    /** Starts a run in the background. False (and nothing happens) when a run is already going. */
    public boolean start() {
        if (!running.compareAndSet(false, true)) {
            return false;
        }
        try {
            executor.execute(this::runGuarded);
        } catch (RuntimeException e) {
            running.set(false);
            throw e;
        }
        return true;
    }

    private void runGuarded() {
        try {
            run();
        } catch (RuntimeException e) {
            log.warn("Backup run failed: {}", e.getClass().getSimpleName());
            String reason = "Backup failed (" + e.getClass().getSimpleName() + ").";
            backupLog.failed(reason);
            lastRun = new BackupLog.LastRun(clock.instant(), false, reason);
        } finally {
            running.set(false);
        }
    }

    private void run() {
        String stamp = STAMP.format(LocalDateTime.ofInstant(clock.instant(), BackupLog.ZONE));
        List<String> done = new ArrayList<>();
        List<String> failures = new ArrayList<>();

        if (exporter.supported()) {
            String name = "ss-" + stamp;
            try {
                long bytes = exporter.export(name);
                backupLog.ok(name + ".dmp", bytes);
                done.add("database " + megabytes(bytes));
            } catch (RuntimeException e) {
                String reason = e instanceof DbExporter.DbExportException ? e.getMessage()
                        : "Database export failed (" + e.getClass().getSimpleName() + ").";
                backupLog.failed(reason);
                failures.add(reason);
            }
        } else {
            String reason = "Database backup needs Oracle";
            backupLog.failed(reason);
            failures.add(reason);
        }

        try {
            Path zip = zipper.zip(dataDir, backupsDir, "data-" + stamp);
            long bytes = Files.size(zip);
            backupLog.ok(zip.getFileName().toString(), bytes);
            done.add("data files " + megabytes(bytes));
        } catch (IOException | RuntimeException e) {
            String reason = "Data backup failed (" + e.getClass().getSimpleName() + ").";
            backupLog.failed(reason);
            failures.add(reason);
        }

        try {
            DataZipper.prune(backupsDir, "ss-", ".dmp", KEEP_DUMPS);
            DataZipper.prune(backupsDir, "data-", ".zip", KEEP_ZIPS);
        } catch (IOException e) {
            log.warn("Could not prune old backups: {}", e.getClass().getSimpleName());
        }

        boolean ok = failures.isEmpty();
        String message = ok ? "Saved " + String.join(", ", done)
                : String.join(" ", failures) + (done.isEmpty() ? "" : " Saved " + String.join(", ", done) + ".");
        lastRun = new BackupLog.LastRun(clock.instant(), ok, message);
    }

    private static String megabytes(long bytes) {
        return String.format(Locale.ROOT, "%.1f MB", bytes / 1024.0 / 1024.0);
    }

    public Status status() {
        BackupLog.LastRun last = lastRun != null ? lastRun : backupLog.last();
        return new Status(running.get(), last, items());
    }

    /** The dumps and zips in {@code data/backups}, newest first. */
    List<Item> items() {
        if (!Files.isDirectory(backupsDir)) {
            return List.of();
        }
        List<Item> items = new ArrayList<>();
        try (Stream<Path> files = Files.list(backupsDir)) {
            for (Path file : (Iterable<Path>) files::iterator) {
                Matcher m = BACKUP_FILE.matcher(file.getFileName().toString());
                if (!m.matches() || !Files.isRegularFile(file)) {
                    continue;
                }
                boolean dump = "ss".equals(m.group(1));
                if (dump != "dmp".equals(m.group(3))) {
                    continue;
                }
                items.add(new Item(file.getFileName().toString(), dump ? Kind.DATABASE : Kind.DATA,
                        Files.size(file), createdAt(m.group(2), file)));
            }
        } catch (IOException e) {
            log.warn("Could not list backups: {}", e.getClass().getSimpleName());
        }
        items.sort(Comparator.comparing(Item::createdAt).thenComparing(Item::name).reversed());
        return items;
    }

    private static Instant createdAt(String stamp, Path file) {
        try {
            return LocalDateTime.parse(stamp, STAMP).atZone(BackupLog.ZONE).toInstant();
        } catch (DateTimeParseException e) {
            try {
                return Files.getLastModifiedTime(file).toInstant();
            } catch (IOException io) {
                return Instant.EPOCH;
            }
        }
    }
}
