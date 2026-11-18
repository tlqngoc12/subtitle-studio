package com.subtitlestudio.backup;

/** A backup was asked for while another one is still running. */
public class BackupRunningException extends RuntimeException {

    public BackupRunningException() {
        super("A backup is already running.");
    }
}
