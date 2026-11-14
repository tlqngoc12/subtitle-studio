package com.subtitlestudio.novel;

/** Retry was asked while the novel's notebook updates are paused. */
public class NotebookPausedException extends RuntimeException {

    public NotebookPausedException() {
        super("Notebook updates are paused.");
    }
}
