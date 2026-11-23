package com.subtitlestudio.novel;

public class NothingToExportException extends RuntimeException {

    public NothingToExportException(long novelId) {
        super("Novel " + novelId + " has no chapter text to export");
    }

    private NothingToExportException(String message) {
        super(message);
    }

    public static NothingToExportException forChapter(long chapterId) {
        return new NothingToExportException("Chapter " + chapterId + " has no text to export");
    }
}
