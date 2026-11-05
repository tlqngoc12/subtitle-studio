package com.subtitlestudio.publish;

import com.subtitlestudio.novel.NovelStatus;
import java.time.Instant;
import java.util.List;

/** One card of the public Novels list (spec section 7). Only novels with a published chapter. */
public record PublicNovelSummary(String slug, String title, String coverUrl, String originalAuthor, List<String> tags,
                                 NovelStatus novelStatus, int publishedCount, Instant updatedAt) {
}
