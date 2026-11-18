package com.subtitlestudio.novel;

/**
 * Everything one Gemini request for (part of) a text chapter carries. {@code sourceLanguage} is {@code th} or
 * {@code en}. {@code chapterLabel}, {@code previousText} (the previous chapter's translation) and
 * the two carry-over fields (the end of the previous part's original and of its translation, only for the later parts
 * of a split chapter) may be null. The prompt has no images: image markers in {@code sourceText} are dropped before
 * anything is sent to Gemini.
 */
public record TextChapterPrompt(String novelTitle, int chapterNo, String chapterLabel, String profile,
                                String previousText, String sourceLanguage,
                                String carrySource, String carryTranslation, String sourceText) {

    /** The label, or "Chương N". */
    public String chapterName() {
        return chapterLabel == null || chapterLabel.isBlank() ? "Chương " + chapterNo : chapterLabel;
    }

    public String languageName() {
        return switch (sourceLanguage == null ? "" : sourceLanguage) {
            case "th" -> "tiếng Thái";
            case "en" -> "tiếng Anh";
            case "es" -> "tiếng Tây Ban Nha";
            default -> throw new IllegalStateException("Unknown source language: " + sourceLanguage);
        };
    }

    /** The prompt for one piece of the chapter. */
    public TextChapterPrompt withText(String text, String carrySource, String carryTranslation) {
        return new TextChapterPrompt(novelTitle, chapterNo, chapterLabel, profile, previousText,
                sourceLanguage, carrySource, carryTranslation, text);
    }
}
