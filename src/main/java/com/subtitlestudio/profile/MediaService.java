package com.subtitlestudio.profile;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Uploaded images: one {@code t_media} row plus the file {@code {data-dir}/media/{id}.{ext}}.
 * Files are removed only after the deleting transaction commits, so a rolled-back edit never loses an image.
 */
@Service
public class MediaService {

    public static final long MAX_BYTES = 10L * 1024 * 1024;
    static final Duration ABANDONED_AFTER = Duration.ofHours(24);
    private static final int MAX_NAME_LENGTH = 255;
    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    private final MediaRepository media;
    private final ImageSniffer sniffer;
    private final SubtitleStudioProperties properties;
    private final Clock clock;

    public MediaService(MediaRepository media, ImageSniffer sniffer, SubtitleStudioProperties properties, Clock clock) {
        this.media = media;
        this.sniffer = sniffer;
        this.properties = properties;
        this.clock = clock;
    }

    /** Saves the row first (the id names the file), then writes the file; a failed write rolls the row back. */
    @Transactional
    public Media store(String originalName, byte[] bytes) {
        if (bytes.length == 0) {
            throw new InvalidMediaException("Empty file");
        }
        if (bytes.length > MAX_BYTES) {
            throw new MediaTooLargeException();
        }
        ImageType type = sniffer.sniff(bytes)
                .orElseThrow(() -> new InvalidMediaException("Not a JPEG, PNG, WebP or GIF image"));
        Media saved = media.saveAndFlush(new Media(type.contentType(), bytes.length, displayName(originalName),
                clock.instant()));
        Path file = fileOf(saved.getId(), type);
        try {
            Files.createDirectories(file.getParent());
            Files.write(file, bytes);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not write " + file, e);
        }
        return saved;
    }

    @Transactional(readOnly = true)
    public StoredMedia load(long id) {
        Media m = media.findById(id).orElseThrow(() -> new MediaNotFoundException(id));
        ImageType type = typeOf(m);
        Path file = fileOf(id, type);
        if (!Files.isRegularFile(file)) {
            throw new MediaNotFoundException(id);
        }
        return new StoredMedia(file, type.contentType());
    }

    /** Deletes the given images that no block or item shows any more. */
    @Transactional
    public void deleteIfUnreferenced(Collection<Long> mediaIds) {
        mediaIds.stream().filter(Objects::nonNull).distinct()
                .filter(id -> !media.isReferenced(id))
                .forEach(id -> media.findById(id).ifPresent(this::delete));
    }

    /** Deletes images nobody shows that were uploaded longer than {@code age} ago (abandoned uploads). */
    @Transactional
    public int deleteUnreferencedOlderThan(Duration age) {
        List<Media> abandoned = media.findUnreferencedCreatedBefore(clock.instant().minus(age));
        abandoned.forEach(this::delete);
        return abandoned.size();
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void cleanUpOnStartup() {
        try {
            int deleted = deleteUnreferencedOlderThan(ABANDONED_AFTER);
            if (deleted > 0) {
                log.info("Deleted {} abandoned uploaded image(s)", deleted);
            }
        } catch (RuntimeException e) {
            log.warn("Could not clean up abandoned images", e);
        }
    }

    private void delete(Media m) {
        Path file = fileOf(m.getId(), typeOf(m));
        media.delete(m);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    deleteFile(file);
                }
            });
        } else {
            deleteFile(file);
        }
    }

    private static void deleteFile(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            log.warn("Could not delete {}", file, e);
        }
    }

    private Path fileOf(long id, ImageType type) {
        return properties.mediaDir().resolve(id + "." + type.extension());
    }

    private static ImageType typeOf(Media m) {
        return ImageType.fromContentType(m.getContentType())
                .orElseThrow(() -> new IllegalStateException("Unknown content type " + m.getContentType()));
    }

    private static String displayName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        String stripped = name.strip();
        return stripped.length() > MAX_NAME_LENGTH ? stripped.substring(0, MAX_NAME_LENGTH) : stripped;
    }
}
