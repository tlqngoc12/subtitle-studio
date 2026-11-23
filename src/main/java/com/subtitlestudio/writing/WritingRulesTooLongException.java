package com.subtitlestudio.writing;

/** The writing rules text is longer than {@link WritingRulesController#MAX_LENGTH} characters. */
public class WritingRulesTooLongException extends RuntimeException {

    public WritingRulesTooLongException(int max) {
        super("The writing rules are longer than " + max + " characters");
    }
}
