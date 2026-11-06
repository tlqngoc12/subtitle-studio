package com.subtitlestudio.novel;

import java.util.List;

/**
 * Edit a chapter; null fields are left as they are. {@code text} is the whole chapter edited in one box (blank = go
 * back to the page texts). {@code label} replaces "Chapter N" where the chapter is shown (blank = no label).
 */
public record ChapterUpdateRequest(Integer chapterNo, String title, List<PageTextEdit> pages, String text,
                                   String label) {

    public ChapterUpdateRequest(Integer chapterNo, String title, List<PageTextEdit> pages, String text) {
        this(chapterNo, title, pages, text, null);
    }

    public ChapterUpdateRequest(Integer chapterNo, String title, List<PageTextEdit> pages) {
        this(chapterNo, title, pages, null, null);
    }

    /** Changes only the label. */
    public static ChapterUpdateRequest label(String label) {
        return new ChapterUpdateRequest(null, null, null, null, label);
    }
}
