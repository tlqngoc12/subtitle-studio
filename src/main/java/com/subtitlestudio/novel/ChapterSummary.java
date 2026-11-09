package com.subtitlestudio.novel;

/** One row of a novel's chapter list. */
public record ChapterSummary(long id, int chapterNo, String title, String label,
                             ChapterTranslationStatus translationStatus,
                             String translationError, String translationModel, ChapterPublishStatus publishStatus, int pageCount,
                             int suspectPages) {
}
