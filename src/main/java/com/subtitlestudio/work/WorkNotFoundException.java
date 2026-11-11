package com.subtitlestudio.work;

public class WorkNotFoundException extends RuntimeException {

    public WorkNotFoundException(long id) {
        super("Work not found: " + id);
    }
}
