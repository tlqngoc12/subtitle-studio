package com.subtitlestudio.novel;

import java.util.List;

/** A novel with its chapters (no chapter text) and the state of its notebook update; the trailer id may be null. */
public record NovelDetail(long id, String slug, String title, Long coverMediaId, String coverUrl,
                          String originalAuthor, String description, List<String> tags, NovelStatus novelStatus,
                          String translatorCredit, String sourceUrl, String promptProfile,
                          String trailerVideoId, NotebookStatus notebookStatus, String notebookError, List<ChapterSummary> chapters,
                          NovelSourceType sourceType, String sourceLanguage, String wattpadStoryId) {
}
