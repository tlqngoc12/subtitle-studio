package com.subtitlestudio.photo;

/** The post does not exist, is protected or was deleted. */
public class XPostNotFoundException extends RuntimeException {

    public XPostNotFoundException() {
        super("Couldn't find a public post at this link");
    }
}
