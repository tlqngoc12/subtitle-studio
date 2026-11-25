package com.subtitlestudio.novel;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Pure rules for chapter titles: the name, the review key, the default title and the V30 migration naming. */
public final class ChapterTitles {

    public static final int MAX_TITLE = 200;

    private static final Pattern NUMBERED =
            Pattern.compile("^(?:chương|chapter)\\s+0*(\\d+)$", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /** A chapter as it was before V30: optional label and optional title. */
    public record LegacyChapter(String label, String title) {}

    private ChapterTitles() {}

    /** The part before the first colon, stripped (the whole title when there is no colon). */
    public static String name(String title) {
        if (title == null) {
            return "";
        }
        int colon = title.indexOf(':');
        return (colon < 0 ? title : title.substring(0, colon)).strip();
    }

    public static OptionalInt number(String title) {
        Matcher m = NUMBERED.matcher(name(title));
        if (!m.matches()) {
            return OptionalInt.empty();
        }
        try {
            return OptionalInt.of(Integer.parseInt(m.group(1)));
        } catch (NumberFormatException e) {
            return OptionalInt.empty();
        }
    }

    /** {@code ch-N} for numbered names, otherwise a slug of the name; empty when the slug is empty. */
    public static Optional<String> reviewKey(String title) {
        String name = name(title);
        OptionalInt n = number(title);
        if (n.isPresent()) {
            return Optional.of("ch-" + n.getAsInt());
        }
        String slug = Normalizer.normalize(name.replace('đ', 'd').replace('Đ', 'D'), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(java.util.Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        return slug.isEmpty() ? Optional.empty() : Optional.of(slug);
    }

    public static String defaultTitle(Collection<String> existingTitles, String partName) {
        int highest = 0;
        for (String t : existingTitles) {
            OptionalInt n = number(t);
            if (n.isPresent()) {
                highest = Math.max(highest, n.getAsInt());
            }
        }
        String title = "Chương " + (highest + 1);
        if (partName != null && !partName.isBlank()) {
            title += ": " + partName.strip();
        }
        return cut(title);
    }

    public static List<String> migrate(List<LegacyChapter> inReadingOrder) {
        List<String> out = new ArrayList<>();
        int last = 0;
        for (LegacyChapter c : inReadingOrder) {
            String name;
            if (c.label() != null && !c.label().isBlank()) {
                name = c.label().strip();
                OptionalInt n = number(name);
                if (n.isPresent()) {
                    last = n.getAsInt();
                }
            } else {
                last++;
                name = "Chương " + last;
            }
            String title = c.title() != null && !c.title().isBlank() ? name + ": " + c.title().strip() : name;
            out.add(cut(title));
        }
        return out;
    }

    private static String cut(String s) {
        return s.length() <= MAX_TITLE ? s : s.substring(0, MAX_TITLE);
    }
}
