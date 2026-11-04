package com.subtitlestudio.publish;

import java.time.Instant;

/** A playlist in {@code data/playlists.json}; counts only videos that have Vietsub. */
public record PublicPlaylistSummary(long id, String name, String description, int videoCount, String thumbnailUrl,
                                    Instant updatedAt) {
}
