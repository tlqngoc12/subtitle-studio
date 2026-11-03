package com.subtitlestudio.translate;

/** Video is longer than the translation limit. */
public class VideoTooLongException extends RuntimeException {

    public VideoTooLongException(String videoId) {
        super("Video is longer than the translation limit: " + videoId);
    }
}
