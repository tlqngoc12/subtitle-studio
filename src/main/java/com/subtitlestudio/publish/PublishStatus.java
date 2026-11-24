package com.subtitlestudio.publish;

import java.time.Instant;

/**
 * Publish state for the admin UI. {@code status} is IDLE, PUBLISHING, DONE or FAILED; {@code url} is null until
 * publishing is configured; {@code error} is a safe message (never the token);
 * {@code fileCount} is the number of files in the site of the latest publish that got as far as counting (null before);
 * {@code progress} is a short note while a long step runs (uploading chapter images), else null.
 */
public record PublishStatus(String status, boolean configured, Instant lastPublishedAt, String url, String error,
                            Integer fileCount, String progress) {

    /** Without a progress note; for callers that do not care. */
    public PublishStatus(String status, boolean configured, Instant lastPublishedAt, String url, String error,
                         Integer fileCount) {
        this(status, configured, lastPublishedAt, url, error, fileCount, null);
    }
}
