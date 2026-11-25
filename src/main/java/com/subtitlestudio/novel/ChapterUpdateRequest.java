package com.subtitlestudio.novel;

import java.util.List;

/**
 * Edit a chapter; null fields are left as they are. {@code title} is the chapter's name everywhere (the chapter
 * number is internal and cannot be changed). {@code text} is the whole chapter edited in one box (blank = go back to
 * the page texts).
 */
public record ChapterUpdateRequest(String title, List<PageTextEdit> pages, String text) {

    public ChapterUpdateRequest(String title, List<PageTextEdit> pages) {
        this(title, pages, null);
    }
}
