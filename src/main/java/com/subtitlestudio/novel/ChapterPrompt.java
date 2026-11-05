package com.subtitlestudio.novel;

import java.util.List;

/**
 * Everything one Gemini request for a chapter carries (spec section 4). {@code notebookText}, {@code previousText}
 * (the previous chapter's translation) and {@code carryOver} (the end of the previous batch) may be null.
 */
public record ChapterPrompt(String novelTitle, int chapterNo, String profile, String notebookText,
                            String previousText, String carryOver, List<PageImage> pages) {
}
