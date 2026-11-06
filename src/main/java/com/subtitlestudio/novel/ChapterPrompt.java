package com.subtitlestudio.novel;

import java.util.List;

/**
 * Everything one Gemini request for a chapter carries (spec section 4). {@code chapterLabel} (e.g. "Ngoại truyện 1"),
 * {@code notebookText}, {@code previousText} (the previous chapter's translation) and {@code carryOver} (the end of
 * the previous batch) may be null.
 */
public record ChapterPrompt(String novelTitle, int chapterNo, String chapterLabel, String profile,
                            String notebookText, String previousText, String carryOver, List<PageImage> pages) {

    public ChapterPrompt(String novelTitle, int chapterNo, String profile, String notebookText, String previousText,
                         String carryOver, List<PageImage> pages) {
        this(novelTitle, chapterNo, null, profile, notebookText, previousText, carryOver, pages);
    }

    /** The label, or "Chương N". */
    public String chapterName() {
        return chapterLabel == null || chapterLabel.isBlank() ? "Chương " + chapterNo : chapterLabel;
    }
}
