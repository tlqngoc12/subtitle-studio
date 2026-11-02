package com.subtitlestudio.url;

/** Thrown when the input is not a supported YouTube URL or video id. */
public class InvalidUrlException extends RuntimeException {

    public InvalidUrlException(String input) {
        super("Not a valid YouTube URL or video id: " + input);
    }
}
