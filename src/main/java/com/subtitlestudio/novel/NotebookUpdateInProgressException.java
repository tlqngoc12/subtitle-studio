package com.subtitlestudio.novel;

public class NotebookUpdateInProgressException extends RuntimeException {

    public NotebookUpdateInProgressException(long novelId) {
        super("The notebook of novel " + novelId + " is being updated");
    }
}
