package com.subtitlestudio.subtitle;

/** Thrown when content is not a valid WebVTT document. */
public class VttParseException extends RuntimeException {

    public VttParseException(String message) {
        super(message);
    }
}
