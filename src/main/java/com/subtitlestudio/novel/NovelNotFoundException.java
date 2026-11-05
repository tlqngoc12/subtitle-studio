package com.subtitlestudio.novel;

public class NovelNotFoundException extends RuntimeException {

    public NovelNotFoundException(long id) {
        super("Novel " + id + " not found");
    }
}
