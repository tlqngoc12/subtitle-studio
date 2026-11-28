package com.subtitlestudio.novel;

import java.time.Instant;

/**
 * One row of a novel's chapter list. {@code lastSyncedAt} and {@code wattpadModifiedAt} are set only for a chapter
 * of an original story that was synced from Wattpad: when it was synced, and the part's modification date on
 * Wattpad in the synced version (null when Wattpad gave none).
 */
public record ChapterSummary(long id, int chapterNo, String title,
                             ChapterTranslationStatus translationStatus,
                             String translationError, String translationModel, ChapterPublishStatus publishStatus, int pageCount,
                             int suspectPages, boolean translatedByFallback, Instant lastSyncedAt,
                             Instant wattpadModifiedAt) {

    /** Without the sync marks (null). */
    public ChapterSummary(long id, int chapterNo, String title,
                          ChapterTranslationStatus translationStatus, String translationError, String translationModel,
                          ChapterPublishStatus publishStatus, int pageCount, int suspectPages,
                          boolean translatedByFallback) {
        this(id, chapterNo, title, translationStatus, translationError, translationModel, publishStatus,
                pageCount, suspectPages, translatedByFallback, null, null);
    }

    /** Without the fallback flag (false) and the sync marks. */
    public ChapterSummary(long id, int chapterNo, String title,
                          ChapterTranslationStatus translationStatus, String translationError, String translationModel,
                          ChapterPublishStatus publishStatus, int pageCount, int suspectPages) {
        this(id, chapterNo, title, translationStatus, translationError, translationModel, publishStatus,
                pageCount, suspectPages, false);
    }
}
