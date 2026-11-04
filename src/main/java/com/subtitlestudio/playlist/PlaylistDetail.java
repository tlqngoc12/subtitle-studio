package com.subtitlestudio.playlist;

import com.subtitlestudio.video.VideoDto;
import java.time.Instant;
import java.util.List;

/** A playlist with its videos in order. */
public record PlaylistDetail(long id, String name, String description, Instant updatedAt, List<VideoDto> videos) {
}
