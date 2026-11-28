package com.subtitlestudio.novel;

import java.time.Instant;
import java.util.List;

/**
 * A chapter with its pages and the ids of the chapters before and after it (in reading order). {@code sourceType} is
 * its novel's kind: an ORIGINAL chapter is written by hand and never translated. {@code wattpadLinked} is true when
 * its novel is an original story with a Wattpad link (the chapter page then offers Sync from Wattpad).
 */
public record ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title,
                            ChapterTranslationStatus translationStatus, String translationError,
                            String translationModel, Instant translatedAt, boolean editedAfterTranslation,
                            ChapterPublishStatus publishStatus, List<PageDto> pages, String text,
                            Long prevChapterId, Long nextChapterId, String sourceText, String wattpadPartId,
                            Instant sourceFetchedAt, String sourceLanguage, int skippedImages,
                            boolean translatedByFallback, NovelSourceType sourceType,
                            boolean wattpadLinked) {

    /** Without the link flag (false). */
    public ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title,
                         ChapterTranslationStatus translationStatus, String translationError,
                         String translationModel, Instant translatedAt, boolean editedAfterTranslation,
                         ChapterPublishStatus publishStatus, List<PageDto> pages, String text,
                         Long prevChapterId, Long nextChapterId, String sourceText, String wattpadPartId,
                         Instant sourceFetchedAt, String sourceLanguage, int skippedImages,
                         boolean translatedByFallback, NovelSourceType sourceType) {
        this(id, novelId, novelTitle, chapterNo, title, translationStatus, translationError, translationModel,
                translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId, nextChapterId,
                sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, skippedImages, translatedByFallback,
                sourceType, false);
    }

    /** Without the count of images a fetch could not download (0 for every reading of a chapter). */
    public ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title,
                         ChapterTranslationStatus translationStatus, String translationError,
                         String translationModel, Instant translatedAt, boolean editedAfterTranslation,
                         ChapterPublishStatus publishStatus, List<PageDto> pages, String text,
                         Long prevChapterId, Long nextChapterId, String sourceText, String wattpadPartId,
                         Instant sourceFetchedAt, String sourceLanguage) {
        this(id, novelId, novelTitle, chapterNo, title, translationStatus, translationError, translationModel,
                translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId, nextChapterId,
                sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, 0, false, NovelSourceType.SCREENSHOTS);
    }

    /** Without the fallback flag (false). */
    public ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title,
                         ChapterTranslationStatus translationStatus, String translationError,
                         String translationModel, Instant translatedAt, boolean editedAfterTranslation,
                         ChapterPublishStatus publishStatus, List<PageDto> pages, String text,
                         Long prevChapterId, Long nextChapterId, String sourceText, String wattpadPartId,
                         Instant sourceFetchedAt, String sourceLanguage, int skippedImages) {
        this(id, novelId, novelTitle, chapterNo, title, translationStatus, translationError, translationModel,
                translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId, nextChapterId,
                sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, skippedImages, false, NovelSourceType.SCREENSHOTS);
    }

    /** The same chapter, told its novel's kind (SCREENSHOTS when not told). */
    public ChapterDetail withSourceType(NovelSourceType kind) {
        return new ChapterDetail(id, novelId, novelTitle, chapterNo, title, translationStatus, translationError,
                translationModel, translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId,
                nextChapterId, sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, skippedImages,
                translatedByFallback, kind, wattpadLinked);
    }

    /** The same chapter, flagged when a fallback model (not the main one) translated it. */
    public ChapterDetail withTranslatedByFallback(boolean fallback) {
        return new ChapterDetail(id, novelId, novelTitle, chapterNo, title, translationStatus, translationError,
                translationModel, translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId,
                nextChapterId, sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, skippedImages, fallback,
                sourceType, wattpadLinked);
    }

    /** The same chapter, told how many images the fetch that produced it had to skip. */
    public ChapterDetail withSkippedImages(int skipped) {
        return new ChapterDetail(id, novelId, novelTitle, chapterNo, title, translationStatus, translationError,
                translationModel, translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId,
                nextChapterId, sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, skipped,
                translatedByFallback, sourceType, wattpadLinked);
    }

    /** The same chapter, told whether its novel has a Wattpad link. */
    public ChapterDetail withWattpadLinked(boolean linked) {
        return new ChapterDetail(id, novelId, novelTitle, chapterNo, title, translationStatus, translationError,
                translationModel, translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId,
                nextChapterId, sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, skippedImages,
                translatedByFallback, sourceType, linked);
    }
}
