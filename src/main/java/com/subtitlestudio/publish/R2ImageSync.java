package com.subtitlestudio.publish;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Keeps the R2 bucket in step with the chapter images of a publish: {@link #upload} puts the ones that are missing
 * (before the deploy, so the site never points at an image that is not there yet), {@link #prune} removes the ones
 * no chapter uses any more (after a successful deploy, so a failed deploy never loses images the live site needs).
 */
@Component
public class R2ImageSync {

    static final String PREFIX = "novel-images/";
    private static final int THREADS = 8;
    private static final int PROGRESS_EVERY = 100;
    private static final String UPLOAD_FAILED = "Could not upload chapter images to R2.";

    private static final Logger log = LoggerFactory.getLogger(R2ImageSync.class);

    private final R2ImageStore store;

    public R2ImageSync(R2ImageStore store) {
        this.store = store;
    }

    /**
     * Uploads the images whose key is not in the bucket yet. {@code progress} gets (done, total) at the start, at
     * least every 100 images and at the end. Returns how many were uploaded.
     *
     * @throws PublishFailedException when listing or any upload fails
     */
    public int upload(List<ChapterImage> images, BiConsumer<Integer, Integer> progress) {
        Map<String, ChapterImage> wanted = new LinkedHashMap<>();
        for (ChapterImage image : images) {
            wanted.putIfAbsent(image.key(), image);
        }
        List<ChapterImage> missing;
        try {
            Set<String> existing = store.listKeys(PREFIX);
            missing = wanted.values().stream().filter(i -> !existing.contains(i.key())).toList();
        } catch (RuntimeException e) {
            log.warn("Could not list the R2 bucket: {}", e.getClass().getSimpleName());
            throw new PublishFailedException(UPLOAD_FAILED);
        }
        int total = missing.size();
        if (total == 0) {
            return 0;
        }
        progress.accept(0, total);

        AtomicInteger done = new AtomicInteger();
        Object lock = new Object();
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (ChapterImage image : missing) {
                futures.add(pool.submit(() -> {
                    store.put(image.key(), image.file(), contentType(image.key()));
                    synchronized (lock) {
                        int n = done.incrementAndGet();
                        if (n % PROGRESS_EVERY == 0 || n == total) {
                            progress.accept(n, total);
                        }
                    }
                }));
            }
            for (Future<?> f : futures) {
                f.get();
            }
        } catch (ExecutionException e) {
            log.warn("Could not upload a chapter image to R2: {}", e.getCause().getClass().getSimpleName());
            throw new PublishFailedException(UPLOAD_FAILED);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new PublishFailedException(UPLOAD_FAILED);
        } finally {
            pool.shutdownNow();
        }
        return total;
    }

    /**
     * Deletes bucket images that {@code keep} does not list. Never throws. Returns how many keys were deleted, or 0
     * when nothing was deleted: on an error, or when the safety stop applies (an empty {@code keep}, or more than
     * half of the keys in the bucket would go).
     */
    public int prune(List<ChapterImage> keep) {
        try {
            if (keep.isEmpty()) {
                log.warn("Not pruning R2: the publish has no chapter images");
                return 0;
            }
            Set<String> keepKeys = new TreeSet<>();
            keep.forEach(i -> keepKeys.add(i.key()));
            Set<String> existing = store.listKeys(PREFIX);
            List<String> stale = existing.stream().filter(k -> !keepKeys.contains(k)).toList();
            if (stale.isEmpty()) {
                return 0;
            }
            if (stale.size() * 2L > existing.size()) {
                log.warn("Not pruning R2: {} of {} images would be deleted", stale.size(), existing.size());
                return 0;
            }
            store.delete(stale);
            return stale.size();
        } catch (RuntimeException e) {
            log.warn("Could not prune R2: {}", e.getClass().getSimpleName());
            return 0;
        }
    }

    private static String contentType(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) {
            return "image/png";
        }
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
            return "image/jpeg";
        }
        if (lower.endsWith(".gif")) {
            return "image/gif";
        }
        return "image/webp";
    }
}
