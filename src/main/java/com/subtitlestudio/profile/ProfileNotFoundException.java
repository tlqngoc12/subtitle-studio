package com.subtitlestudio.profile;

public class ProfileNotFoundException extends RuntimeException {

    public ProfileNotFoundException(String slug) {
        super("Profile not found: " + slug);
    }
}
