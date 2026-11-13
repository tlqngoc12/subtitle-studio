package com.subtitlestudio.translate;

/** A profile with this name already exists and must not be overwritten. */
public class ProfileExistsException extends RuntimeException {

    public ProfileExistsException(String name) {
        super("The profile " + name + " already exists");
    }
}
