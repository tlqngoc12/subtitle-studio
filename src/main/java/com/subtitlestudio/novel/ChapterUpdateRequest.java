package com.subtitlestudio.novel;

import java.util.List;

/**
 * Edit a chapter; null fields are left as they are. {@code text} is the whole chapter edited in one box (blank = go
 * back to the page texts).
 */
public record ChapterUpdateRequest(Integer chapterNo, String title, List<PageTextEdit> pages, String text) {

    public ChapterUpdateRequest(Integer chapterNo, String title, List<PageTextEdit> pages) {
        this(chapterNo, title, pages, null);
    }
}
