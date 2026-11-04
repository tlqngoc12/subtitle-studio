package com.subtitlestudio.translate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Checks Gemini's answer against what was sent: exactly the same ids, each with non-blank text. */
public final class TranslationOutput {

    private static final Pattern LINE_BREAK = Pattern.compile("\\r\\n?");

    private static final int MAX_LOGGED_IDS = 10;

    private TranslationOutput() {
    }

    /**
     * Returns the lines in the order of {@code sent}, text stripped and line breaks normalised to
     * {@code \n}; throws {@link TranslationFailedException} when anything is missing, extra, duplicated or blank.
     */
    public static List<TranslatedLine> validate(List<SourceLine> sent, List<TranslatedLine> got) {
        Map<Integer, Integer> seen = new HashMap<>();
        Map<Integer, String> textById = new HashMap<>();
        for (TranslatedLine line : got) {
            seen.merge(line.id(), 1, Integer::sum);
            textById.put(line.id(), line.text() == null ? "" : LINE_BREAK.matcher(line.text()).replaceAll("\n").strip());
        }

        List<TranslatedLine> ordered = new ArrayList<>(sent.size());
        for (SourceLine source : sent) {
            String text = textById.get(source.id());
            if (seen.getOrDefault(source.id(), 0) == 1 && !text.isEmpty()) {
                ordered.add(new TranslatedLine(source.id(), text));
            }
        }
        boolean extra = seen.size() > sent.size()
                || seen.keySet().stream().anyMatch(id -> sent.stream().noneMatch(s -> s.id() == id));
        if (ordered.size() != sent.size() || extra) {
            throw invalid(ordered.size(), sent.size());
        }
        return ordered;
    }

    /**
     * One-line diagnosis of an answer for the log: counts and the first missing ids, never subtitle text.
     * Same notion of "valid" as {@link #validate}: the id was sent, appears exactly once and has non-blank text.
     */
    public static String describe(List<SourceLine> sent, List<TranslatedLine> got) {
        Map<Integer, Integer> seen = new HashMap<>();
        Map<Integer, Boolean> blankById = new HashMap<>();
        int blank = 0;
        for (TranslatedLine line : got) {
            seen.merge(line.id(), 1, Integer::sum);
            boolean isBlank = line.text() == null || line.text().isBlank();
            blankById.merge(line.id(), isBlank, Boolean::logicalOr);
            if (isBlank) {
                blank++;
            }
        }
        Set<Integer> sentIds = new HashSet<>();
        List<Integer> missing = new ArrayList<>();
        int valid = 0;
        for (SourceLine source : sent) {
            sentIds.add(source.id());
            int count = seen.getOrDefault(source.id(), 0);
            if (count == 0) {
                missing.add(source.id());
            } else if (count == 1 && !blankById.get(source.id())) {
                valid++;
            }
        }
        long extra = seen.keySet().stream().filter(id -> !sentIds.contains(id)).count();
        long duplicated = seen.values().stream().filter(n -> n > 1).count();
        String missingIds = missing.stream().limit(MAX_LOGGED_IDS).map(String::valueOf).collect(Collectors.joining(", "))
                + (missing.size() > MAX_LOGGED_IDS ? ", …" : "");
        return "items=" + got.size() + " valid=" + valid + "/" + sent.size() + " missing=" + missing.size()
                + " extra=" + extra + " duplicated=" + duplicated + " blank=" + blank + " missingIds=[" + missingIds + "]";
    }

    static TranslationFailedException invalid(int valid, int total) {
        return new TranslationFailedException(
                "Gemini returned missing or mismatched lines (" + valid + "/" + total + " valid), try again.");
    }
}
