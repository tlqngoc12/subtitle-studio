package com.subtitlestudio.novel;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Everything one Gemini request for (part of) a text chapter carries. {@code sourceLanguage} is {@code th} or
 * {@code en}. {@code chapterLabel}, {@code previousText} (the previous chapter's translation) and
 * the two carry-over fields (the end of the previous part's original and of its translation, only for the later parts
 * of a split chapter) may be null. {@code images} are the chapter's images that its marker paragraphs name (empty for
 * a chapter without images, which is then translated exactly as before).
 */
public record TextChapterPrompt(String novelTitle, int chapterNo, String chapterLabel, String profile,
                                String previousText, String sourceLanguage,
                                String carrySource, String carryTranslation, String sourceText,
                                List<PromptImage> images) {

    public TextChapterPrompt {
        images = images == null ? List.of() : List.copyOf(images);
    }

    /** A prompt without images. */
    public TextChapterPrompt(String novelTitle, int chapterNo, String chapterLabel, String profile,
                             String previousText, String sourceLanguage,
                             String carrySource, String carryTranslation, String sourceText) {
        this(novelTitle, chapterNo, chapterLabel, profile, previousText, sourceLanguage, carrySource,
                carryTranslation, sourceText, List.of());
    }

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

    /** The prompt for one piece of the chapter: only the images whose markers the piece holds, in marker order. */
    public TextChapterPrompt withText(String text, String carrySource, String carryTranslation) {
        return new TextChapterPrompt(novelTitle, chapterNo, chapterLabel, profile, previousText,
                sourceLanguage, carrySource, carryTranslation, text, imagesIn(text));
    }

    private List<PromptImage> imagesIn(String text) {
        if (images.isEmpty()) {
            return images;
        }
        Map<Long, PromptImage> byId = images.stream()
                .collect(Collectors.toMap(PromptImage::mediaId, Function.identity(), (a, b) -> a));
        return new LinkedHashSet<>(ImageMarkers.ids(text)).stream().map(byId::get)
                .filter(java.util.Objects::nonNull).toList();
    }
}
