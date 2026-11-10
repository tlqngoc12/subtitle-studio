package com.subtitlestudio.translate;

/** Gemini's answer to a profile analysis is unusable (not the schema, empty, or over 20 KB). */
public class AnalysisInvalidException extends RuntimeException {

    public AnalysisInvalidException(String message) {
        super(message);
    }
}
