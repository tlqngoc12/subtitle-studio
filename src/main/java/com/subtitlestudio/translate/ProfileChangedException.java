package com.subtitlestudio.translate;

/** The profile file changed on disk since it was opened. */
public class ProfileChangedException extends RuntimeException {

    public ProfileChangedException(String message) {
        super(message);
    }
}
