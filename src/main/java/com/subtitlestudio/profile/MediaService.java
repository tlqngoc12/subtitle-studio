package com.subtitlestudio.profile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Uploaded images: one {@code t_media} row plus its file under {@code {data-dir}/media} (new uploads start in
 * {@code _inbox/}, {@link MediaFiler} moves them into the folder of the feature that uses them).
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
    private final ImageResizer resizer;
    private final MediaStorage storage;
    private final Clock clock;

    public MediaService(MediaRepository media, ImageSniffer sniffer, ImageResizer resizer,
                        MediaStorage storage, Clock clock) {
        this.media = media;
        this.sniffer = sniffer;
        this.resizer = resizer;
        this.storage = storage;
        this.clock = clock;
    }

    /** Saves the row, then writes a new file (never replacing one); a failed write rolls the row back. */
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
        return persist(originalName, bytes, type, null, null);
    }

    /**
     * Like {@link #store} but shrinks the image to {@code maxSide} and re-encodes it (lossy WebP); the size is checked
     * before anything is decoded and the saved row carries the resulting width and height.
     */
    @Transactional
    public Media storeResized(String originalName, byte[] bytes, int maxSide) {
        if (bytes.length == 0) {
            throw new InvalidMediaException("Empty file");
        }
        if (bytes.length > MAX_BYTES) {
            throw new MediaTooLargeException();
        }
        ImageResizer.Resized resized = resizer.resize(bytes, maxSide);
        return persist(originalName, resized.bytes(), resized.type(), resized.width(), resized.height());
    }

    private Media persist(String originalName, byte[] bytes, ImageType type, Integer width, Integer height) {
        Media created = new Media(type.contentType(), bytes.length, displayName(originalName), clock.instant());
        if (width != null) {
            created.setSize(width, height);
        }
        Path file = uniqueInboxFile(created);
        created.setStoragePath(storage.root().relativize(file).toString().replace(java.io.File.separatorChar, '/'));
        Media saved = media.saveAndFlush(created);
        try {
            Files.createDirectories(file.getParent());
            Files.write(file, bytes, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not write " + file, e);
        }
        return saved;
    }

    private Path uniqueInboxFile(Media created) {
        Path dir = storage.root().resolve(MediaFiler.INBOX);
        String name = MediaNames.fileName(created, "upload");
        Path file = dir.resolve(name);
        for (int n = 2; Files.exists(file); n++) {
            file = dir.resolve(MediaNames.withSuffix(name, n));
        }
        return file;
    }

    @Transactional(readOnly = true)
    public StoredMedia load(long id) {
        Media m = media.findById(id).orElseThrow(() -> new MediaNotFoundException(id));
        Path file = storage.locate(m).orElseThrow(() -> new MediaNotFoundException(id));
        return new StoredMedia(file, typeOf(m).contentType());
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
    @Order(0)
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
        media.delete(m);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    deleteFile(m);
                }
            });
        } else {
            deleteFile(m);
        }
    }

    /** Removes the file wherever it is now (the other database sharing the directory may have moved it). */
    private void deleteFile(Media m) {
        Path file = storage.locate(m).orElse(null);
        if (file == null) {
            return;
        }
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            log.warn("Could not delete {}", file, e);
        }
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
