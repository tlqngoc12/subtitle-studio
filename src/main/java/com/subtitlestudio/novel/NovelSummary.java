package com.subtitlestudio.novel;

import java.time.Instant;

/** One card of the Novels list. {@code coverUrl} is {@code /api/media/{id}} or null. */
public record NovelSummary(long id, String slug, String title, String coverUrl, NovelStatus novelStatus,
                           int chapterCount, int publishedCount, Instant updatedAt) {
}
