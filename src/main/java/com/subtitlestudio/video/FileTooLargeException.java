package com.subtitlestudio.video;

/** An uploaded .srt is larger than {@link VietsubService#MAX_SRT_BYTES}. */
public class FileTooLargeException extends RuntimeException {

    public FileTooLargeException() {
        super("Upload exceeds 5 MB");
    }
}
