package com.subtitlestudio.translate;

/** The translation profile does not exist or cannot be used (bad name, too large, not UTF-8). */
public class UnknownProfileException extends RuntimeException {

    public UnknownProfileException(String name) {
        super("Unknown translation profile: " + name);
    }
}
