package com.subtitlestudio.novel;

import java.time.Instant;
import java.util.List;

/**
 * A chapter with its pages and the ids of the chapters before and after it (in reading order). {@code notebookStatus}
 * is the novel's notebook state, and {@code notebookChapterNo} the chapter it is updating after (only while UPDATING).
 */
public record ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title, String label,
                            ChapterTranslationStatus translationStatus, String translationError,
                            String translationModel, Instant translatedAt, boolean editedAfterTranslation,
                            ChapterPublishStatus publishStatus, List<PageDto> pages, String text,
                            Long prevChapterId, Long nextChapterId, String sourceText, String wattpadPartId,
                            Instant sourceFetchedAt, String sourceLanguage, NotebookStatus notebookStatus,
                            Integer notebookChapterNo, int skippedImages) {

    /** Without the count of images a fetch could not download (0 for every reading of a chapter). */
    public ChapterDetail(long id, long novelId, String novelTitle, int chapterNo, String title, String label,
                         ChapterTranslationStatus translationStatus, String translationError,
                         String translationModel, Instant translatedAt, boolean editedAfterTranslation,
                         ChapterPublishStatus publishStatus, List<PageDto> pages, String text,
                         Long prevChapterId, Long nextChapterId, String sourceText, String wattpadPartId,
                         Instant sourceFetchedAt, String sourceLanguage, NotebookStatus notebookStatus,
                         Integer notebookChapterNo) {
        this(id, novelId, novelTitle, chapterNo, title, label, translationStatus, translationError, translationModel,
                translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId, nextChapterId,
                sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, notebookStatus, notebookChapterNo, 0);
    }

    /** The same chapter, told how many images the fetch that produced it had to skip. */
    public ChapterDetail withSkippedImages(int skipped) {
        return new ChapterDetail(id, novelId, novelTitle, chapterNo, title, label, translationStatus, translationError,
                translationModel, translatedAt, editedAfterTranslation, publishStatus, pages, text, prevChapterId,
                nextChapterId, sourceText, wattpadPartId, sourceFetchedAt, sourceLanguage, notebookStatus,
                notebookChapterNo, skipped);
    }
}
