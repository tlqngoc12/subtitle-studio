package com.subtitlestudio.publish;

import java.time.Instant;

/**
 * Publish state for the admin UI. {@code status} is IDLE, PUBLISHING, DONE or FAILED; {@code url} is null until
 * publishing is configured; {@code error} is a safe message (never the token).
 */
public record PublishStatus(String status, boolean configured, Instant lastPublishedAt, String url, String error) {
}
