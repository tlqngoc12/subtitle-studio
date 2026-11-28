package com.subtitlestudio.novel.wattpad;

/** A Sync with Wattpad of this novel is already running; only one runs at a time. */
public class WattpadSyncRunningException extends RuntimeException {

    public static final String CODE = "WATTPAD_SYNC_RUNNING";

    public WattpadSyncRunningException(long novelId) {
        super("A sync with Wattpad is already running for this story.");
    }
}
