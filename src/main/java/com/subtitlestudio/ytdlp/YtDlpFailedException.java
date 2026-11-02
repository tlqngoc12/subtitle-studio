package com.subtitlestudio.ytdlp;

/** yt-dlp exited with an error or produced output that could not be understood. */
public class YtDlpFailedException extends RuntimeException {

    public YtDlpFailedException(String message) {
        super(message);
    }

    public YtDlpFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}
