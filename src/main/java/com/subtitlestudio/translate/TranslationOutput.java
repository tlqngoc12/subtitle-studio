package com.subtitlestudio.translate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Checks Gemini's answer against what was sent: exactly the same ids, each with non-blank text, and (when the answer
 * echoes the start of the English line) each text sitting on the id of the line it translates.
 */
public final class TranslationOutput {

    private static final Pattern LINE_BREAK = Pattern.compile("\\r\\n?");

    private static final Pattern NOT_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");

    private static final int MAX_LOGGED_IDS = 10;

    /** Words an echo must agree on; fewer when either side has fewer. */
    private static final int ECHO_WORDS = 2;

    /** This many failed echoes in a row (in sent order) mean the answer slid onto the wrong ids. */
    static final int SLIDE_RUN = 3;

    private TranslationOutput() {
    }

    /**
     * The valid lines of an answer (in {@code sent} order), the sent lines that are not valid, and how many
     * distinct ids were returned that were never sent.
     */
    public record Checked(List<TranslatedLine> valid, List<SourceLine> missing, int extra) {}

    /** Same as {@link #checkAnswer} for an answer without echoes (no echo check is made). */
    public static Checked check(List<SourceLine> sent, List<TranslatedLine> got) {
        return checkAnswer(sent, withoutEchoes(got));
    }

    private static List<AnswerLine> withoutEchoes(List<TranslatedLine> got) {
        return got.stream().map(line -> new AnswerLine(line.id(), null, line.text())).toList();
    }

    /**
     * Splits an answer: a sent id is valid when it appears exactly once with non-blank text (stripped, line breaks
     * normalised to {@code \n}) and, when the item carries {@code src}, the echo matches the line sent with that id;
     * every other sent line is missing. From the first run of {@link #SLIDE_RUN} present lines whose echo fails, that
     * line and every later sent line are missing too. Extra ids are only counted.
     */
    static Checked checkAnswer(List<SourceLine> sent, List<AnswerLine> got) {
        Map<Integer, Integer> seen = new HashMap<>();
        Map<Integer, AnswerLine> byId = new HashMap<>();
        for (AnswerLine line : got) {
            seen.merge(line.id(), 1, Integer::sum);
            byId.put(line.id(), line);
        }

        int slideAt = -1;
        int run = 0;
        for (int i = 0; i < sent.size() && slideAt < 0; i++) {
            SourceLine source = sent.get(i);
            if (isPresent(seen, byId, source.id()) && !echoOk(byId.get(source.id()), source)) {
                run++;
                if (run >= SLIDE_RUN) {
                    slideAt = i - SLIDE_RUN + 1;
                }
            } else {
                run = 0;
            }
        }

        List<TranslatedLine> valid = new ArrayList<>(sent.size());
        List<SourceLine> missing = new ArrayList<>();
        Set<Integer> sentIds = new HashSet<>();
        for (int i = 0; i < sent.size(); i++) {
            SourceLine source = sent.get(i);
            sentIds.add(source.id());
            if (slideAt >= 0 && i >= slideAt) {
                missing.add(source);
            } else if (isPresent(seen, byId, source.id()) && echoOk(byId.get(source.id()), source)) {
                valid.add(new TranslatedLine(source.id(), cleanText(byId.get(source.id()))));
            } else {
                missing.add(source);
            }
        }
        int extra = (int) seen.keySet().stream().filter(id -> !sentIds.contains(id)).count();
        return new Checked(valid, missing, extra);
    }

    private static boolean isPresent(Map<Integer, Integer> seen, Map<Integer, AnswerLine> byId, int id) {
        return seen.getOrDefault(id, 0) == 1 && !cleanText(byId.get(id)).isEmpty();
    }

    private static String cleanText(AnswerLine line) {
        return line.text() == null ? "" : LINE_BREAK.matcher(line.text()).replaceAll("\n").strip();
    }

    /** True when the item has no echo (not checked) or its echo matches the line that was sent with its id. */
    private static boolean echoOk(AnswerLine line, SourceLine source) {
        return line.src() == null || line.src().isBlank() || echoMatches(line.src(), source.text());
    }

    /**
     * Whether {@code echo} starts like {@code source}: lower case, split on every non letter/digit, and the first
     * {@code min(2, words in echo, words in source)} words equal; no word on either side matches anything.
     */
    static boolean echoMatches(String echo, String source) {
        List<String> a = words(echo);
        List<String> b = words(source);
        int k = Math.min(ECHO_WORDS, Math.min(a.size(), b.size()));
        return a.subList(0, k).equals(b.subList(0, k));
    }

    private static List<String> words(String text) {
        List<String> words = new ArrayList<>();
        if (text != null) {
            for (String word : NOT_WORD.split(text.toLowerCase(Locale.ROOT))) {
                if (!word.isEmpty()) {
                    words.add(word);
                }
            }
        }
        return words;
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
        return summary(sent, withoutEchoes(got));
    }

    /** Like {@link #describe} for an answer with echoes; adds {@code echoMismatch noEcho firstMismatchId}. */
    static String describeAnswer(List<SourceLine> sent, List<AnswerLine> got) {
        Map<Integer, Integer> seen = new HashMap<>();
        Map<Integer, AnswerLine> byId = new HashMap<>();
        for (AnswerLine line : got) {
            seen.merge(line.id(), 1, Integer::sum);
            byId.put(line.id(), line);
        }
        int mismatch = 0;
        int noEcho = 0;
        String first = "-";
        for (SourceLine source : sent) {
            if (!isPresent(seen, byId, source.id())) {
                continue;
            }
            AnswerLine line = byId.get(source.id());
            if (line.src() == null || line.src().isBlank()) {
                noEcho++;
            } else if (!echoMatches(line.src(), source.text())) {
                if (mismatch++ == 0) {
                    first = String.valueOf(source.id());
                }
            }
        }
        return summary(sent, got) + " echoMismatch=" + mismatch + " noEcho=" + noEcho + " firstMismatchId=" + first;
    }

    private static String summary(List<SourceLine> sent, List<AnswerLine> got) {
        Map<Integer, Integer> seen = new HashMap<>();
        Map<Integer, Boolean> blankById = new HashMap<>();
        int blank = 0;
        for (AnswerLine line : got) {
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
