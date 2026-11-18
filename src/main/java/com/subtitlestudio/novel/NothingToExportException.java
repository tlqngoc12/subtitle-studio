package com.subtitlestudio.novel;

public class NothingToExportException extends RuntimeException {

    public NothingToExportException(long novelId) {
        super("Novel " + novelId + " has no chapter text to export");
    }
}
