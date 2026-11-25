package com.subtitlestudio.novel.render;

import java.awt.image.BufferedImage;
import java.util.function.Function;

/**
 * What one chapter image set is drawn from. {@code chapterTitle} (the chapter's whole name, e.g. "Chương 7: Bữa cơm")
 * may be null. {@code images} loads the picture a {@code [[image:N]]} marker line stands for
 * (null when it is gone, then the marker is skipped); it is never called for a text without markers.
 */
public record RenderInput(String novelTitle, int chapterNo, String chapterTitle, String text,
                          String watermark, Function<Long, BufferedImage> images) {

    /** A chapter without images. */
    public RenderInput(String novelTitle, int chapterNo, String chapterTitle, String text,
                       String watermark) {
        this(novelTitle, chapterNo, chapterTitle, text, watermark, id -> null);
    }
}
