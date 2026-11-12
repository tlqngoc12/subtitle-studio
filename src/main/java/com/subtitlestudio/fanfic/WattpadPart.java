package com.subtitlestudio.fanfic;

import java.time.Instant;

/** One chapter ("part") of a Wattpad story as listed by the story API; dates may be null. */
public record WattpadPart(String id, String title, int wordCount, Instant createdAt, Instant modifiedAt,
                          boolean deleted) {
}
