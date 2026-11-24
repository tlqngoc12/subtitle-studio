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
     * The valid lines of an answer (in {@code sent} order), the sent lines that are not valid, and how many
     * distinct ids were returned that were never sent.
     */
    public record Checked(List<TranslatedLine> valid, List<SourceLine> missing, int extra) {}

    /**
     * Splits an answer: a sent id is valid when it appears exactly once with non-blank text (stripped, line breaks
     * normalised to {@code \n}); every other sent line is missing (absent, duplicated or blank). Extra ids are only counted.
     */
    public static Checked check(List<SourceLine> sent, List<TranslatedLine> got) {
        Map<Integer, Integer> seen = new HashMap<>();
        Map<Integer, String> textById = new HashMap<>();
        for (TranslatedLine line : got) {
            seen.merge(line.id(), 1, Integer::sum);
            textById.put(line.id(), line.text() == null ? "" : LINE_BREAK.matcher(line.text()).replaceAll("\n").strip());
        }

        List<TranslatedLine> valid = new ArrayList<>(sent.size());
        List<SourceLine> missing = new ArrayList<>();
        Set<Integer> sentIds = new HashSet<>();
        for (SourceLine source : sent) {
            sentIds.add(source.id());
            String text = textById.get(source.id());
            if (seen.getOrDefault(source.id(), 0) == 1 && !text.isEmpty()) {
                valid.add(new TranslatedLine(source.id(), text));
            } else {
                missing.add(source);
            }
        }
        int extra = (int) seen.keySet().stream().filter(id -> !sentIds.contains(id)).count();
        return new Checked(valid, missing, extra);
    }

    /**
     * Returns the lines in the order of {@code sent}, text stripped and line breaks normalised to
     * {@code \n}; throws {@link TranslationFailedException} when anything is missing, duplicated or blank.
     * Ids that were not sent are ignored.
     */
    public static List<TranslatedLine> validate(List<SourceLine> sent, List<TranslatedLine> got) {
        Checked checked = check(sent, got);
        if (!checked.missing().isEmpty()) {
            throw invalid(checked.valid().size(), sent.size());
        }
        return checked.valid();
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
