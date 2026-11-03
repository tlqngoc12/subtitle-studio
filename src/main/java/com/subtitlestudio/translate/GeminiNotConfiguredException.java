package com.subtitlestudio.translate;

/** GEMINI_API_KEY is not set. */
public class GeminiNotConfiguredException extends RuntimeException {

    public GeminiNotConfiguredException(String videoId) {
        super("GEMINI_API_KEY is not set: " + videoId);
    }
}
