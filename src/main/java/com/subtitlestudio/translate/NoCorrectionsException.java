package com.subtitlestudio.translate;

/** No hand-corrected line exists yet for the profile, so there is nothing to analyze. */
public class NoCorrectionsException extends RuntimeException {

    public NoCorrectionsException(String message) {
        super(message);
    }
}
