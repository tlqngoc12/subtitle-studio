package com.subtitlestudio.photo;

/** X gave no usable answer (timeout, network error, 429, 5xx, not JSON, image too large or unreadable). */
public class XUnavailableException extends RuntimeException {

    public XUnavailableException(String message) {
        super(message);
    }

    public XUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
