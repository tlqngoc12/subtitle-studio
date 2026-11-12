package com.subtitlestudio.novel;

/** Gemini's answer was cut off or far too short for the text sent: the caller should split the text and ask again. */
public class TextIncompleteException extends RuntimeException {

    public TextIncompleteException(String message) {
        super(message);
    }
}
