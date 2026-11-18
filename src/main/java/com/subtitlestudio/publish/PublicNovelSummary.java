package com.subtitlestudio.publish;

import com.subtitlestudio.novel.NovelStatus;
import java.time.Instant;
import java.util.List;

/**
 * One card of the public Novels list (spec section 7). Only novels with a published chapter.
 *
 * @param totalChapters   every chapter of the novel, drafts included (the {@code y} of "x/y chapters")
 * @param featured        picked by hand for the banner (the page falls back when none is picked)
 * @param original        an original story by the owner (the "Sáng tác" tab), not a translation; files from before
 *                        this field existed have no value, which counts as a translation
 * @param lastPublishedAt latest {@code publishedAt} of the published chapters; null when none of them has a date
 */
public record PublicNovelSummary(String slug, String title, String coverUrl, String originalAuthor, List<String> tags,
                                 NovelStatus novelStatus, int publishedCount, int totalChapters,
                                 Instant lastPublishedAt, Instant updatedAt, boolean featured, Instant createdAt,
                                 String description, boolean original) {
}
