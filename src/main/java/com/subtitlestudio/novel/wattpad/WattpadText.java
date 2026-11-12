package com.subtitlestudio.novel.wattpad;

import java.util.ArrayList;
import java.util.List;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;

/**
 * Turns the HTML fragment of {@code apiv2/storytext} into plain text: one paragraph per block, paragraphs separated by
 * one blank line, {@code <br>} as a line break, images and other tags dropped.
 */
public final class WattpadText {

    private WattpadText() {
    }

    public static String toPlain(String html) {
        if (html == null || html.isBlank()) {
            return "";
        }
        Document doc = Jsoup.parseBodyFragment(html);
        doc.select("br").forEach(br -> br.replaceWith(new TextNode("\n")));
        doc.select("img, script, style").remove();
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

    /** Adds one paragraph, splitting scene-break lines out so each is a paragraph of its own. */
    private static void addParagraphs(List<String> out, String raw) {
        List<String> current = new ArrayList<>();
        for (String line : raw.replace('\u00A0', ' ').split("\\R", -1)) {
            String clean = line.strip().replaceAll("[ \\t]{2,}", " ");
            if (clean.isEmpty()) {
                continue;
            }
            if (SceneBreak.isBreak(clean)) {
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
