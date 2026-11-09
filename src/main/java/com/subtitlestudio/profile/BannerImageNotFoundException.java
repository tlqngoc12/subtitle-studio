package com.subtitlestudio.profile;

/** The banner image does not exist or belongs to another profile. */
public class BannerImageNotFoundException extends RuntimeException {

    public BannerImageNotFoundException(long id) {
        super("Banner image not found: " + id);
    }
}
