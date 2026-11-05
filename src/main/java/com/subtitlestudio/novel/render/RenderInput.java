package com.subtitlestudio.novel.render;

/** What one chapter image set is drawn from. {@code chapterTitle} may be null. */
public record RenderInput(String novelTitle, int chapterNo, String chapterTitle, String text, String watermark) {
}
