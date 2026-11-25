package com.subtitlestudio.novel;

/** One row of a novel's chapter list. */
public record ChapterSummary(long id, int chapterNo, String title,
                             ChapterTranslationStatus translationStatus,
                             String translationError, String translationModel, ChapterPublishStatus publishStatus, int pageCount,
                             int suspectPages, boolean translatedByFallback) {

    /** Without the fallback flag (false). */
    public ChapterSummary(long id, int chapterNo, String title,
                          ChapterTranslationStatus translationStatus, String translationError, String translationModel,
                          ChapterPublishStatus publishStatus, int pageCount, int suspectPages) {
        this(id, chapterNo, title, translationStatus, translationError, translationModel, publishStatus,
                pageCount, suspectPages, false);
    }
}
