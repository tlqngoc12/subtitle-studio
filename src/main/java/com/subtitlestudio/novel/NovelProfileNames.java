package com.subtitlestudio.novel;

import java.text.Normalizer;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** The file name of an auto-created novel profile, derived from the novel title. */
public final class NovelProfileNames {

    static final int MAX_LENGTH = 40;
    private static final String[] SEPARATORS = {"|", " - ", " – ", " — ", "(", "["};
    private static final Pattern NON_ALNUM = Pattern.compile("[^A-Za-z0-9]+");

    private static final Pattern NUMBERED = Pattern.compile("(.+)-(\\d+)");

    private NovelProfileNames() {
    }

    /**
     * PascalCase name from the title's part before the first separator (whole title when that part has no Latin
     * letters or digits, {@code Wattpad<storyId>} when the whole title has none either), at most 40 characters. When
     * {@code taken} accepts the name, {@code -2}, {@code -3}, ... is appended, still within 40 characters.
     */
    public static String fromTitle(String title, String storyId, Predicate<String> taken) {
        return name(title, "Wattpad" + storyId, "Wattpad", taken);
    }

    /** Same rule for an original story: {@code Original} when the title has no Latin letters or digits at all. */
    public static String forOriginal(String title, Predicate<String> taken) {
        return name(title, "Original", "Original", taken);
    }

    /** True when {@code name} is {@code derived} or {@code derived} with a {@code -N} suffix (as {@code name} adds it). */
    public static boolean isDerived(String name, String derived) {
        if (name == null || derived == null) {
            return false;
        }
        if (name.equals(derived)) {
            return true;
        }
        Matcher m = NUMBERED.matcher(name);
        if (!m.matches()) {
            return false;
        }
        String suffix = "-" + m.group(2);
        return m.group(1).equals(derived.substring(0, Math.min(derived.length(), MAX_LENGTH - suffix.length())));
    }

    private static String name(String title, String idName, String lastResort, Predicate<String> taken) {
        String text = title == null ? "" : title;
        String name = pascal(beforeSeparator(text));
        if (name.isEmpty()) {
            name = pascal(text);
        }
        if (name.isEmpty()) {
            name = pascal(idName);
        }
        if (name.isEmpty()) {
            name = lastResort;
        }
        if (name.length() > MAX_LENGTH) {
            name = name.substring(0, MAX_LENGTH);
        }
        if (!taken.test(name)) {
            return name;
        }
        for (int n = 2; ; n++) {
            String suffix = "-" + n;
            String candidate = name.substring(0, Math.min(name.length(), MAX_LENGTH - suffix.length())) + suffix;
            if (!taken.test(candidate)) {
                return candidate;
            }
        }
    }

    private static String beforeSeparator(String text) {
        int cut = text.length();
        for (String separator : SEPARATORS) {
            int at = text.indexOf(separator);
            if (at >= 0 && at < cut) {
                cut = at;
            }
        }
        return text.substring(0, cut);
    }

    private static String pascal(String text) {
        String plain = Normalizer.normalize(text.replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        StringBuilder out = new StringBuilder();
        for (String word : NON_ALNUM.split(plain)) {
            if (!word.isEmpty()) {
                out.append(Character.toUpperCase(word.charAt(0))).append(word, 1, word.length());
            }
        }
        return out.toString();
    }
}
