package com.subtitlestudio.novel;

import java.util.List;

/**
 * Everything one Gemini request for a chapter carries (spec section 4). {@code chapterTitle} (e.g. "Chương 7: Bữa cơm"),
 * {@code previousText} (the previous chapter's translation) and {@code carryOver} (the end of the previous batch)
 * may be null.
 */
public record ChapterPrompt(String novelTitle, int chapterNo, String chapterTitle, String profile,
                            String previousText, String carryOver, List<PageImage> pages) {

    public ChapterPrompt(String novelTitle, int chapterNo, String profile, String previousText,
                         String carryOver, List<PageImage> pages) {
        this(novelTitle, chapterNo, null, profile, previousText, carryOver, pages);
    }

    /** The title before its first colon, or "Chương N" when there is no title. */
    public String chapterName() {
        String name = ChapterTitles.name(chapterTitle);
        return name.isEmpty() ? "Chương " + chapterNo : name;
    }
}
