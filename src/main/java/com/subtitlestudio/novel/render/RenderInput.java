package com.subtitlestudio.novel.render;

/**
 * What one chapter image set is drawn from. {@code chapterLabel} (e.g. "Ngoại truyện 1", shown instead of the number)
 * and {@code chapterTitle} may be null.
 */
public record RenderInput(String novelTitle, int chapterNo, String chapterLabel, String chapterTitle, String text,
                          String watermark) {

    boolean hasLabel() {
        return chapterLabel != null && !chapterLabel.isBlank();
    }
}
