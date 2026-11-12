package com.subtitlestudio.novel;

/** The operation needs a novel that comes from Wattpad. */
public class NovelNotWattpadException extends RuntimeException {

    public NovelNotWattpadException(long novelId) {
        super("Novel " + novelId + " does not come from Wattpad");
    }
}
