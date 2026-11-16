package com.subtitlestudio.novel;

import java.time.Instant;

/** Chapter totals of one novel, computed in SQL so no chapter text is loaded. */
public record NovelChapterStats(long novelId, long chapters, long published, Instant lastPublishedAt) {
}
