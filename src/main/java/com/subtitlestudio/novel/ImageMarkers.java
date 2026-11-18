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

    /**
     * True when every id occurs in {@code given} at most as often as in {@code owned} (so none outside it). The same
     * image used twice in a chapter has one media id twice.
     */
    public static boolean isSubMultiset(List<Long> owned, List<Long> given) {
        java.util.Map<Long, Integer> left = new java.util.HashMap<>();
        owned.forEach(id -> left.merge(id, 1, Integer::sum));
        for (long id : given) {
            if (left.merge(id, -1, Integer::sum) < 0) {
                return false;
            }
        }
        return true;
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
}
