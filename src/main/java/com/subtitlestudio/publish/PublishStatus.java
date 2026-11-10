package com.subtitlestudio.publish;

import java.time.Instant;

/**
 * Publish state for the admin UI. {@code status} is IDLE, PUBLISHING, DONE or FAILED; {@code url} is null until
 * publishing is configured; {@code error} is a safe message (never the token);
 * {@code fileCount} is the number of files in the site of the latest publish that got as far as counting (null before).
 */
public record PublishStatus(String status, boolean configured, Instant lastPublishedAt, String url, String error,
                            Integer fileCount) {
}
