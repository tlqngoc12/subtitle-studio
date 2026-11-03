package com.subtitlestudio.profile;

public class MediaNotFoundException extends RuntimeException {

    public MediaNotFoundException(long id) {
        super("Image not found: " + id);
    }
}
