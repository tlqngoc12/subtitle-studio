package com.subtitlestudio.translate;

/** A translation is already running for this video. */
public class TranslationInProgressException extends RuntimeException {

    public TranslationInProgressException(String videoId) {
        super("A translation is already running for this video: " + videoId);
    }
}
