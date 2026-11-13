package com.subtitlestudio.novel;

/** Five novels are already picked for the public banner. */
public class BannerFullException extends RuntimeException {

    public BannerFullException() {
        super("The banner already has 5 novels. Remove one first.");
    }
}
