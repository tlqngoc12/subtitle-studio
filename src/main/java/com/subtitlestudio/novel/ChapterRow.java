package com.subtitlestudio.novel;

import java.time.Instant;

/**
 * The metadata of a chapter (no text columns), read by a JPQL constructor expression. {@code sourceFetchedAt} and
 * {@code wattpadModifiedAt} are the sync marks of an original story's chapter.
 */
public record ChapterRow(long id, int chapterNo, String title,
                         ChapterTranslationStatus translationStatus, String translationError,
                         String translationModel, ChapterPublishStatus publishStatus,
                         Instant sourceFetchedAt, Instant wattpadModifiedAt) {

    /** Without the sync marks (null). */
    public ChapterRow(long id, int chapterNo, String title, ChapterTranslationStatus translationStatus,
                      String translationError, String translationModel, ChapterPublishStatus publishStatus) {
        this(id, chapterNo, title, translationStatus, translationError, translationModel, publishStatus, null, null);
    }
}
