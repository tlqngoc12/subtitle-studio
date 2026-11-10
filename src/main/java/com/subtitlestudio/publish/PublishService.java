package com.subtitlestudio.publish;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

/**
 * Publishes the public site in the background: export → bundle → wrangler deploy, one publish at a time.
 * The state lives in memory only: after a restart it is IDLE again (a publish takes seconds and can be redone).
 */
@Service
public class PublishService {

    private static final Logger log = LoggerFactory.getLogger(PublishService.class);

    private final SiteExporter exporter;
    private final PublicSiteBundle bundle;
    private final WranglerClient wrangler;
    private final ReadCountsFunctions readCounts;
    /** Cloudflare Pages Free plan: at most 20,000 files per deployment; the admin is warned from 16,000. */
    public static final int FILE_LIMIT = 20_000;
    public static final int FILE_WARNING = 16_000;

    private final SubtitleStudioProperties.Publish settings;
    private final Path tempRoot;
    private final Clock clock;
    private final Executor executor;

    private String status = "IDLE";
    private Instant lastPublishedAt;
    private String error;
    private Integer fileCount;

    public PublishService(SiteExporter exporter, PublicSiteBundle bundle, WranglerClient wrangler,
                          ReadCountsFunctions readCounts, SubtitleStudioProperties properties, Clock clock,
                          @Qualifier("publishExecutor") Executor executor) {
        this.exporter = exporter;
        this.bundle = bundle;
        this.wrangler = wrangler;
        this.readCounts = readCounts;
        this.settings = properties.publish();
        this.tempRoot = properties.dataDir().resolve("publish-tmp");
        this.clock = clock;
        this.executor = executor;
    }

    public synchronized PublishStatus status() {
        boolean configured = settings.configured();
        return new PublishStatus(status, configured, lastPublishedAt, configured ? settings.url() : null, error,
                fileCount);
    }

    public synchronized PublishStatus start() {
        if (!settings.configured()) {
            throw new PublishNotConfiguredException();
        }
        if ("PUBLISHING".equals(status)) {
            throw new PublishInProgressException();
        }
        status = "PUBLISHING";
        error = null;
        executor.execute(this::run);
        return status();
    }

    /** A publish cut short by the previous process may have left its temp directory behind. */
    @EventListener(ApplicationReadyEvent.class)
    public void cleanUpLeftovers() {
        deleteRecursively(tempRoot);
    }

    private void run() {
        Path dir = tempRoot.resolve(UUID.randomUUID().toString());
        try {
            Instant now = clock.instant();
            exporter.export(dir, now);
            bundle.writeTo(dir, settings.indexable());
            readCounts.prepare(dir);
            long files = countFiles(dir);
            recordFileCount((int) files);
            if (files > FILE_LIMIT) {
                throw new PublishFailedException("Site has " + files + " files, over the "
                        + String.format(Locale.ROOT, "%,d", FILE_LIMIT)
                        + " file limit of Cloudflare Pages (Free plan).");
            }
            wrangler.deploy(dir);
            finish("DONE", now, null);
        } catch (PublishFailedException e) {
            finish("FAILED", null, e.userMessage());
        } catch (RuntimeException e) {
            log.warn("Publishing failed", e);
            finish("FAILED", null, "Could not publish: " + e.getClass().getSimpleName() + ".");
        } finally {
            deleteRecursively(dir);
            readCounts.clean(tempRoot);
        }
    }

    private synchronized void recordFileCount(int count) {
        fileCount = count;
    }

    private static long countFiles(Path dir) {
        if (!Files.exists(dir)) {
            return 0;
        }
        try (Stream<Path> paths = Files.walk(dir)) {
            return paths.filter(Files::isRegularFile).count();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private synchronized void finish(String newStatus, Instant publishedAt, String message) {
        status = newStatus;
        if (publishedAt != null) {
            lastPublishedAt = publishedAt;
        }
        error = message;
    }

    private static void deleteRecursively(Path dir) {
        if (!Files.exists(dir)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(dir)) {
            paths.sorted(Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException e) {
                    log.warn("Could not delete {}", p);
                }
            });
        } catch (IOException e) {
            log.warn("Could not clean up {}", dir);
        }
    }
}
