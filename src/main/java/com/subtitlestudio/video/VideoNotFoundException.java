package com.subtitlestudio.video;

/** No video with the given id has been fetched. */
public class VideoNotFoundException extends RuntimeException {

    public VideoNotFoundException(String videoId) {
        super("Video not found: " + videoId);
    }
}
