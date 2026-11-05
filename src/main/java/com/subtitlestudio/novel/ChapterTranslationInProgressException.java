package com.subtitlestudio.novel;

public class ChapterTranslationInProgressException extends RuntimeException {

    public ChapterTranslationInProgressException(long chapterId) {
        super("A translation is already running for chapter " + chapterId);
    }
}
