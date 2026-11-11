package com.subtitlestudio.fanfic;

/** Wattpad did not give a usable answer (timeout, network error, 403/429/5xx, a page that is not JSON). */
public class WattpadUnavailableException extends RuntimeException {

    public WattpadUnavailableException(String message) {
        super(message);
    }

    public WattpadUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
