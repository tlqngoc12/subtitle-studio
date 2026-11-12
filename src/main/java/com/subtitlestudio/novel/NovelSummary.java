package com.subtitlestudio.novel;

import java.time.Instant;

/** One card of the Novels list. {@code coverUrl} is {@code /api/media/{id}} or null;
 * {@code wattpadStoryId} is set for novels translated from Wattpad. */
public record NovelSummary(long id, String slug, String title, String coverUrl, NovelStatus novelStatus,
                           int chapterCount, int publishedCount, Instant updatedAt, String wattpadStoryId) {

    public NovelSummary(long id, String slug, String title, String coverUrl, NovelStatus novelStatus,
                        int chapterCount, int publishedCount, Instant updatedAt) {
        this(id, slug, title, coverUrl, novelStatus, chapterCount, publishedCount, updatedAt, null);
    }
}
