package com.subtitlestudio.novel;

/** The novel has no translation profile (none chosen, or its file is missing), so there is nothing to show or improve. */
public class NoNovelProfileException extends RuntimeException {

    public NoNovelProfileException(long novelId) {
        super("Novel " + novelId + " has no translation profile");
    }
}
