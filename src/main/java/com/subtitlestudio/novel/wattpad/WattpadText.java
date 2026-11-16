package com.subtitlestudio.novel.wattpad;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;

/**
 * Turns the HTML fragment of {@code apiv2/storytext} into plain text: one paragraph per block, paragraphs separated by
 * one blank line, {@code <br>} as a line break, other tags dropped. {@link #parse} keeps each image as a placeholder
 * paragraph {@code [[image-url:<index>]]} where it stands; {@link #toPlain} drops images.
 */
public final class WattpadText {

    private static final Pattern PLACEHOLDER = Pattern.compile("^\\[\\[image-url:(\\d+)]]$");

    /** The text, with a placeholder paragraph per image, and the image URLs the placeholders index. */
    public record Parsed(String text, List<String> imageUrls) {
    }

    private WattpadText() {
    }

    public static String placeholder(int index) {
        return "[[image-url:" + index + "]]";
    }

    /** The index a placeholder paragraph stands for, or -1 when the paragraph is not a placeholder. */
    public static int placeholderIndex(String paragraph) {
        if (paragraph == null) {
            return -1;
        }
        Matcher m = PLACEHOLDER.matcher(paragraph.strip());
        return m.matches() ? Integer.parseInt(m.group(1)) : -1;
    }

    /** The text without images. */
    public static String toPlain(String html) {
        return convert(html, null);
    }

    /** The text with one placeholder paragraph per image (an {@code <img>} without {@code src} is ignored). */
    public static Parsed parse(String html) {
        List<String> urls = new ArrayList<>();
        String text = convert(html, urls);
        return new Parsed(text, urls);
    }

    private static String convert(String html, List<String> imageUrls) {
        if (html == null || html.isBlank()) {
            return "";
        }
        Document doc = Jsoup.parseBodyFragment(html);
        doc.select("br").forEach(br -> br.replaceWith(new TextNode("\n")));
        if (imageUrls == null) {
            doc.select("img").remove();
        } else {
            for (Element img : doc.select("img")) {
                String src = img.attr("src").strip();
                if (src.isEmpty()) {
                    img.remove();
                    continue;
                }
                imageUrls.add(src);
                img.replaceWith(new TextNode("\n" + placeholder(imageUrls.size() - 1) + "\n"));
            }
        }
        doc.select("script, style").remove();
        List<String> paragraphs = new ArrayList<>();
        StringBuilder loose = new StringBuilder();
        for (Node node : doc.body().childNodes()) {
            if (node instanceof Element e && e.isBlock()) {
                addParagraphs(paragraphs, loose.toString());
                loose.setLength(0);
                addParagraphs(paragraphs, e.wholeText());
            } else if (node instanceof Element e) {
                loose.append(e.wholeText());
            } else if (node instanceof TextNode t) {
                loose.append(t.getWholeText());
            }
        }
        addParagraphs(paragraphs, loose.toString());
        return String.join("\n\n", paragraphs).strip();
    }

    /** Adds one paragraph, splitting scene-break and image lines out so each is a paragraph of its own. */
    private static void addParagraphs(List<String> out, String raw) {
        List<String> current = new ArrayList<>();
        for (String line : raw.replace(' ', ' ').split("\\R", -1)) {
            String clean = line.strip().replaceAll("[ \\t]{2,}", " ");
            if (clean.isEmpty()) {
                continue;
            }
            if (SceneBreak.isBreak(clean) || placeholderIndex(clean) >= 0) {
                flush(out, current);
                out.add(clean);
            } else {
                current.add(clean);
            }
        }
        flush(out, current);
    }

    private static void flush(List<String> out, List<String> current) {
        if (!current.isEmpty()) {
            out.add(String.join("\n", current));
            current.clear();
        }
    }
}
