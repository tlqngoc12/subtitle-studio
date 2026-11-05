package com.subtitlestudio.novel;

public class InvalidPageOrderException extends RuntimeException {

    public InvalidPageOrderException() {
        super("The new order must list every page of the chapter exactly once");
    }
}
