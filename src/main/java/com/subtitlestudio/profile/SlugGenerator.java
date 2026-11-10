package com.subtitlestudio.profile;

import java.text.Normalizer;
import java.util.Locale;
import java.util.function.Predicate;

/**
 * URL slug of a member from the display name: accents removed, lowercase letters and digits joined by "-", at most
 * 20 characters. Names without Latin letters (and the reserved word {@code order}) become {@code member-N}.
 */
public final class SlugGenerator {

    static final int MAX_LENGTH = 20;
    private static final String RESERVED = "order";

    private SlugGenerator() {
    }

    public static String slugFor(String name, Predicate<String> taken) {
        String base = normalise(name);
        if (base.isEmpty() || base.equals(RESERVED)) {
            for (int n = 2; ; n++) {
                String candidate = "member-" + n;
                if (!taken.test(candidate)) {
                    return candidate;
                }
            }
        }
        if (!taken.test(base)) {
            return base;
        }
        for (int n = 2; ; n++) {
            String suffix = "-" + n;
            String head = base.length() + suffix.length() > MAX_LENGTH
                    ? base.substring(0, MAX_LENGTH - suffix.length()) : base;
            String candidate = trimDashes(head) + suffix;
            if (!taken.test(candidate)) {
                return candidate;
            }
        }
    }

    private static String normalise(String name) {
        String ascii = Normalizer.normalize(name == null ? "" : name, Normalizer.Form.NFD)
                .replace('đ', 'd').replace('Đ', 'D')
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-");
        String slug = trimDashes(ascii);
        return trimDashes(slug.length() > MAX_LENGTH ? slug.substring(0, MAX_LENGTH) : slug);
    }

    private static String trimDashes(String s) {
        return s.replaceAll("^-+|-+$", "");
    }
}
