package com.subtitlestudio.video;

/** The Vietsub was changed (another save, a finished translation, a new upload) since the editor loaded it. */
public class VietsubChangedException extends RuntimeException {

    public VietsubChangedException(String videoId) {
        super("The Vietsub changed since it was loaded: " + videoId);
    }
}
