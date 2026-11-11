package com.subtitlestudio.fanfic;

/** The pasted text is not a Wattpad story link. */
public class InvalidFanficLinkException extends RuntimeException {

    public InvalidFanficLinkException(String message) {
        super(message);
    }
}
