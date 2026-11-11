package com.subtitlestudio.profile;

/** The EmiBonnie group row cannot be deleted. */
public class GroupProfileException extends RuntimeException {

    public GroupProfileException() {
        super("The group profile cannot be deleted");
    }
}
