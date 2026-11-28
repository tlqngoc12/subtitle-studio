package com.subtitlestudio.video;

/** {@code <id>.vi_manual.srt} does not exist, so there is nothing to reload. */
public class ViManualFileMissingException extends RuntimeException {

    public ViManualFileMissingException(String videoId) {
        super("No vi_manual.srt file for video " + videoId);
    }
}
