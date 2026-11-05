package com.subtitlestudio.novel;

/** Gemini's notebook update broke a limit or left out a required field; the old notebook stays. */
public class InvalidNotebookUpdateException extends RuntimeException {

    public InvalidNotebookUpdateException(String message) {
        super(message);
    }
}
