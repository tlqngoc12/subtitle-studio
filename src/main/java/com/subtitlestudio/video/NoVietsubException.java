package com.subtitlestudio.video;

/** The video exists but has no Vietsub to export. */
public class NoVietsubException extends RuntimeException {

    public NoVietsubException(String videoId) {
        super("Video has no Vietsub: " + videoId);
    }
}
