package com.subtitlestudio.translate;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Trims a YouTube description down to what helps translation: plot, cast, names. */
final class DescriptionCleaner {

    static final int MAX_CHARS = 1500;

    private static final Pattern URL_ONLY = Pattern.compile("^(https?://|www\\.)\\S+$", Pattern.CASE_INSENSITIVE);
    private static final Pattern TAGS_ONLY = Pattern.compile("^([#@]\\S+\\s*)+$");
    private static final List<String> PROMOTIONAL = List.of("subscribe", "follow", "official", "©");

    private DescriptionCleaner() {}

    /** The cleaned description, or null when nothing useful is left. */
    static String clean(String description) {
        if (description == null) {
            return null;
        }
        List<String> kept = new ArrayList<>();
        for (String raw : description.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1)) {
            String line = raw.strip();
            if (line.isEmpty()) {
                kept.add("");
            } else if (!isNoise(line)) {
                kept.add(line);
            }
        }
        StringBuilder out = new StringBuilder();
        boolean pendingBlank = false;
        for (String line : kept) {
            if (line.isEmpty()) {
                pendingBlank = out.length() > 0;
                continue;
            }
            if (pendingBlank) {
                out.append("\n\n");
                pendingBlank = false;
            } else if (out.length() > 0) {
                out.append('\n');
            }
            out.append(line);
        }
        String text = out.length() > MAX_CHARS ? out.substring(0, MAX_CHARS).strip() : out.toString();
        return text.isEmpty() ? null : text;
    }

    private static boolean isNoise(String line) {
        if (URL_ONLY.matcher(line).matches() || TAGS_ONLY.matcher(line).matches()) {
            return true;
        }
        String lower = line.toLowerCase(Locale.ROOT);
        return PROMOTIONAL.stream().anyMatch(lower::contains);
    }
}
