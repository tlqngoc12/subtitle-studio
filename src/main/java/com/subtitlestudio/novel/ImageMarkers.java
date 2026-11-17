package com.subtitlestudio.novel;

import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Image marker paragraphs of a text chapter: a paragraph holding only {@code [[image:<mediaId>]]} stands for an image
 * of the chapter at that place (spec docs/superpowers/specs/2026-11-16-wattpad-chapter-images-design.md). The same
 * marker appears in {@code source_text}, {@code ai_text} and {@code text_vi}. Paragraphs are separated by blank lines.
 */
public final class ImageMarkers {

    private static final Pattern MARKER = Pattern.compile("^\\[\\[image:(\\d+)]]$");
    private static final Pattern PARAGRAPH_BREAK = Pattern.compile("\\n\\s*\\n");

    private ImageMarkers() {
    }

    public static String marker(long mediaId) {
        return "[[image:" + mediaId + "]]";
    }

    /** The media id when the whole paragraph (ignoring surrounding spaces) is a marker. */
    public static OptionalLong mediaId(String paragraph) {
        if (paragraph == null) {
            return OptionalLong.empty();
        }
        Matcher m = MARKER.matcher(paragraph.strip());
        if (!m.matches()) {
            return OptionalLong.empty();
        }
        try {
            return OptionalLong.of(Long.parseLong(m.group(1)));
        } catch (NumberFormatException e) {
            return OptionalLong.empty();
        }
    }

    /** The media ids of the marker paragraphs, in order (a media id may repeat). */
    public static List<Long> ids(String text) {
        List<Long> out = new ArrayList<>();
        if (text == null) {
            return out;
        }
        for (String paragraph : PARAGRAPH_BREAK.split(text)) {
            OptionalLong id = mediaId(paragraph);
            if (id.isPresent()) {
                out.add(id.getAsLong());
            }
        }
        return out;
    }

    public static boolean hasMarkers(String text) {
        return !ids(text).isEmpty();
    }

    /**
     * The text without its marker paragraphs; the blank lines around a removed marker collapse into one. A text
     * without markers is returned as it is.
     */
    public static String strip(String text) {
        if (text == null || !hasMarkers(text)) {
            return text;
        }
        List<String> kept = new ArrayList<>();
        for (String paragraph : PARAGRAPH_BREAK.split(text.strip())) {
            if (!paragraph.isBlank() && mediaId(paragraph).isEmpty()) {
                kept.add(paragraph.strip());
            }
        }
        return String.join("\n\n", kept);
    }

    /**
     * The answer with every marker paragraph of the source put back at its source position, or empty when that cannot
     * be done safely: the answer has a marker the source does not, repeats a marker, or does not have as many text
     * paragraphs as the source (so a source paragraph has no counterpart to anchor to). A marker goes right before the
     * answer paragraph that matches the source paragraph following it, or at the end when it was last; markers in a row
     * keep their order. Markers the answer has are dropped first, so moved ones return to their place too.
     */
    public static java.util.Optional<String> restore(String source, String answer) {
        List<Long> sourceIds = ids(source);
        List<Long> answerIds = ids(answer);
        if (!new java.util.HashSet<>(sourceIds).containsAll(answerIds)
                || answerIds.size() != new java.util.HashSet<>(answerIds).size()) {
            return java.util.Optional.empty();
        }
        List<String> sourceParagraphs = TextSplitter.paragraphs(source);
        List<String> answerText = TextSplitter.paragraphs(answer).stream().filter(p -> mediaId(p).isEmpty()).toList();
        int sourceText = (int) sourceParagraphs.stream().filter(p -> mediaId(p).isEmpty()).count();
        if (sourceText != answerText.size()) {
            return java.util.Optional.empty();
        }
        List<String> out = new ArrayList<>();
        int next = 0;
        for (String paragraph : sourceParagraphs) {
            if (mediaId(paragraph).isPresent()) {
                out.add(paragraph.strip());
            } else {
                out.add(answerText.get(next++));
            }
        }
        return java.util.Optional.of(String.join("\n\n", out));
    }
}
