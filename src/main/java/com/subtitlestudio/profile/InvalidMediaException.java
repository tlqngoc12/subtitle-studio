package com.subtitlestudio.profile;

/** The upload is missing, empty, or not a JPEG/PNG/WebP/GIF image. */
public class InvalidMediaException extends RuntimeException {

    public InvalidMediaException(String message) {
        super(message);
    }
}
