package com.subtitlestudio.photo;

public class PhotoPostNotFoundException extends RuntimeException {

    public PhotoPostNotFoundException(long id) {
        super("Photo post not found: " + id);
    }
}
