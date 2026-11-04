package com.subtitlestudio.publish;

/** A publish step failed; {@link #userMessage()} is safe to show (never contains the Cloudflare token). */
public class PublishFailedException extends RuntimeException {

    private final String userMessage;

    public PublishFailedException(String userMessage) {
        super(userMessage);
        this.userMessage = userMessage;
    }

    public String userMessage() {
        return userMessage;
    }
}
