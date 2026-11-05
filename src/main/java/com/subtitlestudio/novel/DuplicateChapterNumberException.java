package com.subtitlestudio.novel;

public class DuplicateChapterNumberException extends RuntimeException {

    public DuplicateChapterNumberException(int chapterNo) {
        super("This novel already has chapter " + chapterNo);
    }
}
