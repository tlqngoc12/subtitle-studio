package com.subtitlestudio.translate;

/** The profile text is empty or larger than 20 KB. */
public class InvalidProfileTextException extends RuntimeException {

    public InvalidProfileTextException(String message) {
        super(message);
    }
}
