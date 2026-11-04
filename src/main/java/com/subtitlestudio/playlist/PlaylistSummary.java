package com.subtitlestudio.playlist;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/** One row of the playlist list; {@code containsVideo} is only set when the list was asked for a video. */
public record PlaylistSummary(
        long id,
        String name,
        String description,
        int videoCount,
        String thumbnailUrl,
        Instant updatedAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) Boolean containsVideo) {
}
