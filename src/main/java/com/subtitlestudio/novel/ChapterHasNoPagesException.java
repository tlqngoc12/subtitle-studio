package com.subtitlestudio.novel;

public class ChapterHasNoPagesException extends RuntimeException {

    public ChapterHasNoPagesException(long chapterId) {
        super("Chapter " + chapterId + " has no pages to translate");
    }
}
