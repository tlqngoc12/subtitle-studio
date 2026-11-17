package com.subtitlestudio.novel;

import java.time.Instant;
import java.util.List;

/** A chapter with its pages and the ids of the chapters before and after it (in reading order). */
public record ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title, String label,
                            ChapterTranslationStatus translationStatus, String translationError,
                            String translationModel, Instant translatedAt, boolean editedAfterTranslation,
                            ChapterPublishStatus publishStatus, List<PageDto> pages, String text,
                            Long prevChapterId, Long nextChapterId, String sourceText, String wattpadPartId,
                            Instant sourceFetchedAt, String sourceLanguage, int skippedImages,
                            boolean translatedByFallback) {

    /** Without the count of images a fetch could not download (0 for every reading of a chapter). */
    public ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title, String label,
                         ChapterTranslationStatus translationStatus, String translationError,
                         String translationModel, Instant translatedAt, boolean editedAfterTranslation,
                         ChapterPublishStatus publishStatus, List<PageDto> pages, String text,
                         Long prevChapterId, Long nextChapterId, String sourceText, String wattpadPartId,
                         Instant sourceFetchedAt, String sourceLanguage) {
        this(id, novelId, novelTitle, chapterNo, title, label, translationStatus, translationError, translationModel,
                translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId, nextChapterId,
                sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, 0, false);
    }

    /** Without the fallback flag (false). */
    public ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title, String label,
                         ChapterTranslationStatus translationStatus, String translationError,
                         String translationModel, Instant translatedAt, boolean editedAfterTranslation,
                         ChapterPublishStatus publishStatus, List<PageDto> pages, String text,
                         Long prevChapterId, Long nextChapterId, String sourceText, String wattpadPartId,
                         Instant sourceFetchedAt, String sourceLanguage, int skippedImages) {
        this(id, novelId, novelTitle, chapterNo, title, label, translationStatus, translationError, translationModel,
                translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId, nextChapterId,
                sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, skippedImages, false);
    }

    /** The same chapter, flagged when a fallback model (not the main one) translated it. */
    public ChapterDetail withTranslatedByFallback(boolean fallback) {
        return new ChapterDetail(id, novelId, novelTitle, chapterNo, title, label, translationStatus, translationError,
                translationModel, translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId,
                nextChapterId, sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, skippedImages, fallback);
    }

    /** The same chapter, told how many images the fetch that produced it had to skip. */
    public ChapterDetail withSkippedImages(int skipped) {
        return new ChapterDetail(id, novelId, novelTitle, chapterNo, title, label, translationStatus, translationError,
                translationModel, translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId,
                nextChapterId, sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, skipped,
                translatedByFallback);
    }
}
