package com.subtitlestudio.novel;

import java.time.Instant;
import java.util.List;

/** A chapter with its pages and the ids of the chapters before and after it (by number). */
public record ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title,
                            ChapterTranslationStatus translationStatus, String translationError,
                            Instant translatedAt, boolean editedAfterTranslation,
                            ChapterPublishStatus publishStatus, List<PageDto> pages, Long prevChapterId,
                            Long nextChapterId) {
}
