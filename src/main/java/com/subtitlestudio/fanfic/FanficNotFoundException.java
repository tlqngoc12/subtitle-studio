package com.subtitlestudio.fanfic;

/** The story is not on Wattpad (404) or not public, or the fanfic id is unknown here. */
public class FanficNotFoundException extends RuntimeException {

    public FanficNotFoundException() {
        super("Story not found or not public.");
    }

    public FanficNotFoundException(long id) {
        super("Fanfic " + id + " does not exist");
    }
}
