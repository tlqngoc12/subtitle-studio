package com.subtitlestudio.novel;

import java.util.regex.Pattern;

/**
 * File names, markdown and paste-ready HTML of an exported chapter (spec
 * docs/superpowers/specs/2026-11-18-novel-chapter-export-design.md). Pure functions, no I/O.
 */
public final class ChapterExportFormat {

    private static final int MAX_BASE = 120;
    private static final Pattern BAD_FILE_CHARS = Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]");
    private static final Pattern BOLD = Pattern.compile("\\*\\*(.+?)\\*\\*");
    private static final Pattern ITALIC = Pattern.compile("(?<!\\*)\\*(?!\\s)(.+?)(?<!\\s)\\*(?!\\*)");

    private static final String STYLE = "body{max-width:42rem;margin:2rem auto;padding:0 1rem;"
            + "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.7;font-size:1.05rem}"
            + "p{margin:0 0 1em}";

    private ChapterExportFormat() {
    }

    /** The title with its first colon shown as a dash: {@code Chương 7: Bữa cơm} becomes {@code Chương 7 - Bữa cơm}. */
    public static String heading(String title) {
        String t = title == null ? "" : title.strip();
        int colon = t.indexOf(':');
        if (colon < 0) {
            return t;
        }
        String rest = t.substring(colon + 1).strip();
        String name = t.substring(0, colon).strip();
        return rest.isEmpty() ? name : name + " - " + rest;
    }

    /** {@code NNN - <heading>} without extension; {@code position} is 1-based in the full reading order, as in review file names. */
    public static String fileBase(int position, int total, String heading) {
        int width = total >= 1000 ? 4 : 3;
        String prefix = String.format("%0" + width + "d - ", position);
        String clean = BAD_FILE_CHARS.matcher(heading).replaceAll("_").strip();
        String base = prefix + clean;
        if (base.length() > MAX_BASE) {
            int end = MAX_BASE;
            if (Character.isHighSurrogate(base.charAt(end - 1))) {
                end--;
            }
            base = base.substring(0, end).stripTrailing();
        }
        return base;
    }

    public static String markdown(String heading, String text) {
        return "# " + heading + "\n\n" + normalise(text);
    }

    public static String html(String heading, String text) {
        StringBuilder body = new StringBuilder();
        for (String line : normalise(text).split("\n")) {
            if (line.isBlank() || ImageMarkers.mediaId(line).isPresent()) {
                continue;
            }
            body.append("<p>").append(inline(line.strip())).append("</p>");
        }
        return "<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\"><title>" + escape(heading)
                + "</title><style>" + STYLE + "</style></head><body>" + body + "</body></html>";
    }

    private static String normalise(String text) {
        return text.replace("\r\n", "\n").replace('\r', '\n');
    }

    private static String inline(String line) {
        String s = escape(line);
        s = BOLD.matcher(s).replaceAll("<strong>$1</strong>");
        return ITALIC.matcher(s).replaceAll("<em>$1</em>");
    }

    private static String escape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
