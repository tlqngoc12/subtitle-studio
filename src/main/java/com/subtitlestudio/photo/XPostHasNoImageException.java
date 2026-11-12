package com.subtitlestudio.photo;

/** The post exists but carries no photo, video poster or GIF poster. */
public class XPostHasNoImageException extends RuntimeException {

    public XPostHasNoImageException() {
        super("This post has no image");
    }
}
