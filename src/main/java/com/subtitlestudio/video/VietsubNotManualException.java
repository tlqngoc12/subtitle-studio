package com.subtitlestudio.video;

/** Only a MANUAL Vietsub can be marked done: an AI (AUTO) one has not been checked by a person. */
public class VietsubNotManualException extends RuntimeException {

    public VietsubNotManualException(String videoId) {
        super("The Vietsub is not manual: " + videoId);
    }
}
