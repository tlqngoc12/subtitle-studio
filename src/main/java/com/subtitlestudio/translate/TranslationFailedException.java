package com.subtitlestudio.translate;

/** A translation that could not be completed; {@link #userMessage()} is shown to the user as is. */
public class TranslationFailedException extends RuntimeException {

    private final String userMessage;

    public TranslationFailedException(String userMessage) {
        super(userMessage);
        this.userMessage = userMessage;
    }

    public String userMessage() {
        return userMessage;
    }
}
