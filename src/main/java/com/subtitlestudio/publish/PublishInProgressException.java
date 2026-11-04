package com.subtitlestudio.publish;

public class PublishInProgressException extends RuntimeException {

    public PublishInProgressException() {
        super("A publish is already running");
    }
}
