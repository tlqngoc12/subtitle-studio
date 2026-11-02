package com.subtitlestudio.subtitle;

/** The uploaded file is not a readable UTF-8 SubRip (.srt) file. */
public class InvalidSrtException extends RuntimeException {

    public InvalidSrtException(String message) {
        super(message);
    }
}
