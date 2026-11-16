package com.subtitlestudio.novel;

/** The metadata of a chapter (no text columns), read by a JPQL constructor expression. */
public record ChapterRow(long id, int chapterNo, String title, String label,
                         ChapterTranslationStatus translationStatus, String translationError,
                         String translationModel, ChapterPublishStatus publishStatus) {
}
