package com.subtitlestudio.novel;

import java.util.List;

/** A novel with its chapters (no chapter text); the trailer id may be null. */
public record NovelDetail(long id, String slug, String title, Long coverMediaId, String coverUrl,
                          String originalAuthor, String description, List<String> tags, NovelStatus novelStatus,
                          String translatorCredit, String sourceUrl, String promptProfile,
                          String trailerVideoId, List<ChapterSummary> chapters,
                          NovelSourceType sourceType, String sourceLanguage, String wattpadStoryId) {
}
