package com.subtitlestudio.novel;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Updates the two lines of a novel profile that hold the novel title; nothing else in the text changes. */
final class ProfileTitleLines {

    private ProfileTitleLines() {
    }

    /**
     * Replaces {@code # Hồ sơ truyện: <old>}, {@code # Hồ sơ dịch: <old>} and {@code - Tên truyện: "<old>"...} (text after
     * the closing quote kept) when they hold {@code oldTitle} exactly.
     */
    static String retitle(String text, String oldTitle, String newTitle) {
        String old = Pattern.quote(oldTitle);
        String replacement = Matcher.quoteReplacement(newTitle);
        String result = Pattern.compile("^(# Hồ sơ (?:truyện|dịch): )" + old + "$", Pattern.MULTILINE)
                .matcher(text).replaceAll(m -> Matcher.quoteReplacement(m.group(1)) + replacement);
        return Pattern.compile("^(- Tên truyện: \")" + old + "(\".*)$", Pattern.MULTILINE)
                .matcher(result).replaceAll(m -> Matcher.quoteReplacement(m.group(1)) + replacement
                        + Matcher.quoteReplacement(m.group(2)));
    }
}
