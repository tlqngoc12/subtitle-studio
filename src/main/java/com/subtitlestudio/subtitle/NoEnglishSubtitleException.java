package com.subtitlestudio.subtitle;

/** The video has neither manual nor auto-generated English subtitles. */
public class NoEnglishSubtitleException extends RuntimeException {

    public NoEnglishSubtitleException(String videoId) {
        super("No English subtitles available for video " + videoId);
    }
}
