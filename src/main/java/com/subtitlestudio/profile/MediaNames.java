package com.subtitlestudio.profile;

import java.text.Normalizer;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** Builds the readable file name of an uploaded image: {@code yyyy-MM-dd_slug_first8ofKey.ext}. */
public final class MediaNames {

    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    static final int MAX_SLUG = 60;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private MediaNames() {
    }

    /** Original file name without extension, folded to lowercase ASCII words joined by "-" (may be empty). */
    public static String slug(String originalName) {
        if (originalName == null) {
            return "";
        }
        String base = originalName.strip();
        int dot = base.lastIndexOf('.');
        if (dot > 0) {
            base = base.substring(0, dot);
        }
        return fold(base);
    }

    /** Folder name from free text such as a novel slug; falls back to {@code fallback} when nothing is left. */
    public static String folder(String text, String fallback) {
        String s = fold(text == null ? "" : text);
        return s.isEmpty() ? fallback : s;
    }

    public static String fileName(Media m, String categoryWord) {
        String slug = slug(m.getOriginalName());
        if (slug.isEmpty()) {
            slug = categoryWord;
        }
        ImageType type = ImageType.fromContentType(m.getContentType())
                .orElseThrow(() -> new IllegalStateException("Unknown content type " + m.getContentType()));
        return DAY.format(m.getCreatedAt().atZone(ZONE)) + "_" + slug + "_" + shortKey(m) + "." + type.extension();
    }

    public static String shortKey(Media m) {
        return m.getStorageKey().substring(0, 8);
    }

    private static String fold(String text) {
        String folded = Normalizer.normalize(text.replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replaceAll("[^\\x00-\\x7F]", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-");
        folded = trimDashes(folded);
        if (folded.length() > MAX_SLUG) {
            folded = trimDashes(folded.substring(0, MAX_SLUG));
        }
        return folded;
    }

    private static String trimDashes(String s) {
        int from = 0;
        int to = s.length();
        while (from < to && s.charAt(from) == '-') {
            from++;
        }
        while (to > from && s.charAt(to - 1) == '-') {
            to--;
        }
        return s.substring(from, to);
    }

    /** {@code name} with {@code -n} inserted before the extension. */
    static String withSuffix(String name, int n) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? name + "-" + n : name.substring(0, dot) + "-" + n + name.substring(dot);
    }
}
