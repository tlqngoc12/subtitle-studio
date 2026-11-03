package com.subtitlestudio.profile;

/** The image is larger than {@link MediaService#MAX_BYTES}. */
public class MediaTooLargeException extends RuntimeException {

    public MediaTooLargeException() {
        super("Image exceeds 10 MB");
    }
}
