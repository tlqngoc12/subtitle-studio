package com.subtitlestudio.fanfic;

/** The Wattpad story is already added; {@code title} is the existing fanfic's title. */
public class FanficExistsException extends RuntimeException {

    private final String title;

    public FanficExistsException(String title) {
        super("This story is already added as “" + title + "”.");
        this.title = title;
    }

    public String title() {
        return title;
    }
}
