package com.subtitlestudio.novel;

public class ChapterNotTranslatedException extends RuntimeException {

    public ChapterNotTranslatedException(long chapterId) {
        super("Every page of chapter " + chapterId + " needs a translation before publishing");
    }
}
