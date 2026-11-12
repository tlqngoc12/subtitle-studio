package com.subtitlestudio.novel;

/** The chapter's original is text (Wattpad), so page screenshots, page order and per-page text do not apply. */
public class ChapterTextSourceException extends RuntimeException {

    public ChapterTextSourceException(long chapterId) {
        super("Chapter " + chapterId + " is translated from text: it has no pages");
    }
}
