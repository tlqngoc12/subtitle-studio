package com.subtitlestudio.publish;

import java.time.Instant;
import java.util.List;

/** A playlist in {@code data/playlists/<id>.json}, videos in playlist order. */
public record PublicPlaylistDetail(long id, String name, String description, Instant updatedAt,
                                   List<PublicVideo> videos) {
}
