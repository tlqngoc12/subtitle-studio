package com.subtitlestudio.publish;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
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
    private final SubtitleStudioProperties.Publish settings;
    private final Path tempRoot;
    private final Clock clock;
    private final Executor executor;

    private String status = "IDLE";
    private Instant lastPublishedAt;
    private String error;

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
        return new PublishStatus(status, configured, lastPublishedAt, configured ? settings.url() : null, error);
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
