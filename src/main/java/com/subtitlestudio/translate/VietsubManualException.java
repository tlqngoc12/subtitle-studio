package com.subtitlestudio.translate;

/** Video has a Vietsub uploaded by the user. */
public class VietsubManualException extends RuntimeException {

    public VietsubManualException(String videoId) {
        super("Video has a Vietsub uploaded by the user: " + videoId);
    }
}
