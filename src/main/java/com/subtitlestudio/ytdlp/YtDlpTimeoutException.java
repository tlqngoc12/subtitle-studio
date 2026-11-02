package com.subtitlestudio.ytdlp;

/** yt-dlp did not finish within the configured timeout and was killed. */
public class YtDlpTimeoutException extends RuntimeException {

    public YtDlpTimeoutException(String message) {
        super(message);
    }
}
