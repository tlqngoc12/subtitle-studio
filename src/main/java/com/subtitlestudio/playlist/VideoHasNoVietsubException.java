package com.subtitlestudio.playlist;

/** Only videos that have Vietsub can go into a playlist. */
public class VideoHasNoVietsubException extends RuntimeException {

    public VideoHasNoVietsubException(String videoId) {
        super("Video has no Vietsub: " + videoId);
    }
}
