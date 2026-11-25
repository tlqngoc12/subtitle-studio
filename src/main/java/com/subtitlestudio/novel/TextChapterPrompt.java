package com.subtitlestudio.novel;

/**
 * Everything one Gemini request for (part of) a text chapter carries. {@code sourceLanguage} is {@code th} or
 * {@code en}. {@code chapterTitle}, {@code previousText} (the previous chapter's translation) and
 * the two carry-over fields (the end of the previous part's original and of its translation, only for the later parts
 * of a split chapter) may be null. The prompt has no images: image markers in {@code sourceText} are dropped before
 * anything is sent to Gemini.
 */
public record TextChapterPrompt(String novelTitle, int chapterNo, String chapterTitle, String profile,
                                String previousText, String sourceLanguage,
                                String carrySource, String carryTranslation, String sourceText) {

    /** The title before its first colon, or "Chương N" when there is no title. */
    public String chapterName() {
        String name = ChapterTitles.name(chapterTitle);
        return name.isEmpty() ? "Chương " + chapterNo : name;
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
        return new TextChapterPrompt(novelTitle, chapterNo, chapterTitle, profile, previousText,
                sourceLanguage, carrySource, carryTranslation, text);
    }
}
