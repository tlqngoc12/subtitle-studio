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
                            Integer notebookChapterNo) {
}
