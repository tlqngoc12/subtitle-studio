package com.subtitlestudio.novel;

public class PageNotFoundException extends RuntimeException {

    public PageNotFoundException(long id) {
        super("Page " + id + " not found");
    }
}
