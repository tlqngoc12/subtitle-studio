package com.subtitlestudio.profile;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Where an image file lives. {@code storage_path} says where this database put it, but the H2 dev database and Oracle
 * share the data directory and either may have moved the file since, so {@link #locate} falls back to a lookup by
 * storage key across the whole media tree (at most one scan a minute).
 */
@Component
public class MediaStorage {

    static final Duration RESCAN_EVERY = Duration.ofMinutes(1);
    private static final Pattern LEGACY_NAME = Pattern.compile("^([0-9a-f]{8}-[0-9a-f-]{27})\\.[A-Za-z0-9]+$");
    private static final Pattern READABLE_NAME = Pattern.compile("_([0-9a-f]{8})(?:-\\d+)?\\.[A-Za-z0-9]+$");
    private static final Logger log = LoggerFactory.getLogger(MediaStorage.class);

    private final SubtitleStudioProperties properties;
    private final Clock clock;
    private final Map<String, Path> index = new ConcurrentHashMap<>();
    private volatile Instant lastScan;

    public MediaStorage(SubtitleStudioProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public Path root() {
        return properties.mediaDir();
    }

    /** The file where this row says it is (may not exist). */
    public Path fileOf(Media m) {
        Path root = root();
        if (m.getStoragePath() != null) {
            Path p = root.resolve(m.getStoragePath()).normalize();
            if (p.startsWith(root.normalize())) {
                return p;
            }
            throw new IllegalStateException("storage_path escapes the media directory: " + m.getStoragePath());
        }
        return root.resolve(m.getStorageKey() + "." + typeOf(m).extension());
    }

    /** The existing file of this image, wherever it is now, or empty when it is gone. */
    public Optional<Path> locate(Media m) {
        Path expected = fileOf(m);
        if (Files.isRegularFile(expected)) {
            return Optional.of(expected);
        }
        Optional<Path> found = lookup(m);
        if (found.isEmpty() && rescanDue()) {
            rescan();
            found = lookup(m);
        }
        found.ifPresent(p -> log.debug("Media {} not at {}, found at {}", m.getId(), expected, p));
        return found;
    }

    /** Records a file the caller has just moved, so readers do not need a scan to find it. */
    void remember(Media m, Path file) {
        index.put(m.getStorageKey(), file);
    }

    private Optional<Path> lookup(Media m) {
        Path cached = index.get(m.getStorageKey());
        if (cached == null) {
            cached = index.get(MediaNames.shortKey(m));
        }
        return cached != null && Files.isRegularFile(cached) ? Optional.of(cached) : Optional.empty();
    }

    private synchronized boolean rescanDue() {
        Instant now = clock.instant();
        if (lastScan != null && !now.isBefore(lastScan) && Duration.between(lastScan, now).compareTo(RESCAN_EVERY) < 0) {
            return false;
        }
        lastScan = now;
        return true;
    }

    private void rescan() {
        Path root = root();
        if (!Files.isDirectory(root)) {
            return;
        }
        Map<String, Path> fresh = new HashMap<>();
        try (Stream<Path> walk = Files.walk(root)) {
            walk.filter(Files::isRegularFile).forEach(p -> {
                String name = p.getFileName().toString();
                Matcher legacy = LEGACY_NAME.matcher(name);
                if (legacy.matches()) {
                    fresh.put(legacy.group(1), p);
                    return;
                }
                Matcher readable = READABLE_NAME.matcher(name);
                if (readable.find()) {
                    fresh.put(readable.group(1), p);
                }
            });
        } catch (IOException e) {
            throw new UncheckedIOException("Could not scan " + root, e);
        }
        index.clear();
        index.putAll(fresh);
    }

    static ImageType typeOf(Media m) {
        return ImageType.fromContentType(m.getContentType())
                .orElseThrow(() -> new IllegalStateException("Unknown content type " + m.getContentType()));
    }
}
