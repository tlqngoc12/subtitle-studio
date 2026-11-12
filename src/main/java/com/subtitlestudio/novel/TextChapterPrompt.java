package com.subtitlestudio.novel;

/**
 * Everything one Gemini request for (part of) a text chapter carries. {@code sourceLanguage} is {@code th} or
 * {@code en}. {@code chapterLabel}, {@code notebookText}, {@code previousText} (the previous chapter's translation) and
 * the two carry-over fields (the end of the previous part's original and of its translation, only for the later parts
 * of a split chapter) may be null.
 */
public record TextChapterPrompt(String novelTitle, int chapterNo, String chapterLabel, String profile,
                                String notebookText, String previousText, String sourceLanguage,
                                String carrySource, String carryTranslation, String sourceText) {

    /** The label, or "Chương N". */
    public String chapterName() {
        return chapterLabel == null || chapterLabel.isBlank() ? "Chương " + chapterNo : chapterLabel;
    }

    public String languageName() {
        return "en".equals(sourceLanguage) ? "tiếng Anh" : "tiếng Thái";
    }

    public TextChapterPrompt withText(String text, String carrySource, String carryTranslation) {
        return new TextChapterPrompt(novelTitle, chapterNo, chapterLabel, profile, notebookText, previousText,
                sourceLanguage, carrySource, carryTranslation, text);
    }
}
