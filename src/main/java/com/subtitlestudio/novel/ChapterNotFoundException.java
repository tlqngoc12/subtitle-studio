package com.subtitlestudio.novel;

public class ChapterNotFoundException extends RuntimeException {

    public ChapterNotFoundException(long id) {
        super("Chapter " + id + " not found");
    }
}
