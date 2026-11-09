package com.subtitlestudio.novel;

/** Gemini's Vietnamese text for one page, and the Thai text it read from the image ({@code source}, may be null). */
public record TranslatedPage(int page, String text, String source) {

    public TranslatedPage(int page, String text) {
        this(page, text, null);
    }
}
