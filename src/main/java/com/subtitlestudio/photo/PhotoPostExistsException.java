package com.subtitlestudio.photo;

/** The Instagram post is already added; {@code title} is the existing post's title. */
public class PhotoPostExistsException extends RuntimeException {

    private final String title;

    public PhotoPostExistsException(String title) {
        super("This post is already added as “" + title + "”.");
        this.title = title;
    }

    public String title() {
        return title;
    }
}
