package com.subtitlestudio.novel;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** Fills the Thai or English novel profile template with the details of a Wattpad story. */
public final class NovelProfileTemplate {

    static final int MAX_BYTES = 20 * 1024;
    private static final String UNKNOWN = "chưa rõ";
    private static final String NO_SUMMARY = "Chưa có tóm tắt.";
    private static final Map<String, String> TEMPLATES = Map.of(
            "th", load("prompts/_novel_template_th.md"),
            "en", load("prompts/_novel_template_en.md"));

    private NovelProfileTemplate() {
    }

    /**
     * The profile Markdown, at most 20 KB of UTF-8. {@code th} uses the Thai template, anything else the English one.
     * The description is trimmed at a sentence boundary when it would not fit.
     */
    public static String render(String sourceLanguage, String title, String author, List<String> tags,
                                String description) {
        String template = TEMPLATES.get("th".equals(sourceLanguage) ? "th" : "en");
        String genre = tags == null ? "" : String.join(", ", tags.stream().map(NovelProfileTemplate::oneLine)
                .filter(t -> !t.isEmpty()).toList());
        String base = template
                .replace("{{title}}", oneLine(title))
                .replace("{{author}}", orElse(oneLine(author), UNKNOWN))
                .replace("{{genre}}", orElse(genre, UNKNOWN));
        int budget = MAX_BYTES - utf8Length(base.replace("{{summary}}", ""));
        String summary = description == null ? "" : description.replace("{{", "{ {").strip();
        return base.replace("{{summary}}", trim(orElse(summary, NO_SUMMARY), budget));
    }

    private static String oneLine(String s) {
        return s == null ? "" : s.replace("{{", "{ {").replaceAll("\s+", " ").strip();
    }

    private static String orElse(String s, String fallback) {
        return s == null || s.isBlank() ? fallback : s;
    }

    private static int utf8Length(String s) {
        return s.getBytes(StandardCharsets.UTF_8).length;
    }

    /** The longest part of {@code text} within {@code budget} bytes, ending at a sentence boundary when it is cut. */
    static String trim(String text, int budget) {
        if (utf8Length(text) <= budget) {
            return text;
        }
        int end = 0;
        int bytes = 0;
        while (end < text.length()) {
            int cp = text.codePointAt(end);
            int size = utf8Length(new String(Character.toChars(cp)));
            if (bytes + size > budget) {
                break;
            }
            bytes += size;
            end += Character.charCount(cp);
        }
        String head = text.substring(0, end);
        int cut = -1;
        for (int i = head.length() - 1; i >= 0; i--) {
            char c = head.charAt(i);
            boolean terminator = c == '.' || c == '!' || c == '?' || c == '。' || c == '…';
            if (terminator && (i == head.length() - 1 || Character.isWhitespace(head.charAt(i + 1)))) {
                cut = i + 1;
                break;
            }
        }
        return (cut > 0 ? head.substring(0, cut) : head).stripTrailing();
    }

    private static String load(String resource) {
        try (InputStream in = NovelProfileTemplate.class.getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException("Missing template " + resource);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
