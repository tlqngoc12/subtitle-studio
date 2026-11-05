package com.subtitlestudio.novel;

public class DuplicateNovelSlugException extends RuntimeException {

    public DuplicateNovelSlugException(String slug) {
        super("Another novel already uses the slug " + slug);
    }
}
