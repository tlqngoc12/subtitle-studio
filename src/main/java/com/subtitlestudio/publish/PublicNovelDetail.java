package com.subtitlestudio.publish;

import com.subtitlestudio.novel.NovelStatus;
import java.util.List;

/** A novel's public page: the eight fields and its published chapters. Never chapter text. */
public record PublicNovelDetail(String slug, String title, String coverUrl, String originalAuthor, String description,
                                List<String> tags, NovelStatus novelStatus, String translatorCredit, String sourceUrl,
                                List<PublicChapterRef> chapters) {

    public record PublicChapterRef(int chapterNo, String title, String label) {}
}
