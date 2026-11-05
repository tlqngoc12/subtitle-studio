package com.subtitlestudio.novel;

/** One row of a novel's chapter list. */
public record ChapterSummary(long id, int chapterNo, String title, ChapterTranslationStatus translationStatus,
                             String translationError, ChapterPublishStatus publishStatus, int pageCount) {
}
