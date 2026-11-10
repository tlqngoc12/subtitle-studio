package com.subtitlestudio.translate;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Picks the example pairs sent with a translation. Priority: lines a human corrected after the AI, then lines
 * with proper names or forms of address, then the longest remaining lines. Pure logic, no I/O.
 */
final class ExampleSelector {

    static final int MAX_PAIRS = 60;
    static final int MAX_CHARS = 6000;

    private static final Pattern NAME_WORD = Pattern.compile("^\\p{Lu}\\p{Ll}+");
    private static final Pattern ADDRESS = Pattern.compile(
            "(?<!\\p{L})(chị|em|anh|tôi|cậu|P')", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    private ExampleSelector() {}

    /** A candidate line; {@code corrected} = the final Vietnamese differs from the AI's first version. */
    record Candidate(String en, String vi, boolean corrected) {}

    /** The chosen pairs (video by video, in timeline order) and how they were found. */
    record Result(List<ExamplePair> pairs, int videos, int corrected) {}

    /** {@code perVideo} is newest video first, each in timeline order. */
    static Result select(List<List<Candidate>> perVideo) {
        return select(perVideo, MAX_PAIRS, MAX_CHARS);
    }

    static Result select(List<List<Candidate>> perVideo, int maxPairs, int maxChars) {
        List<Entry> entries = new ArrayList<>();
        int order = 0;
        for (int v = 0; v < perVideo.size(); v++) {
            for (Candidate c : perVideo.get(v)) {
                String en = c.en() == null ? "" : c.en().strip();
                String vi = c.vi() == null ? "" : c.vi().strip();
                if (hasContent(en) && hasContent(vi)) {
                    int tier = c.corrected() ? 1 : isNotable(en, vi) ? 2 : 3;
                    entries.add(new Entry(order++, v, tier, new ExamplePair(en, vi), c.corrected()));
                }
            }
        }
        Comparator<Entry> byPriority = Comparator.comparingInt(Entry::tier).thenComparing((a, b) ->
                a.tier() == 3
                        ? Integer.compare(length(b.pair()), length(a.pair()))
                        : Integer.compare(a.order(), b.order()));
        entries.sort(byPriority.thenComparingInt(Entry::order));

        List<Entry> chosen = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int chars = 0;
        for (Entry e : entries) {
            if (chosen.size() >= maxPairs) {
                break;
            }
            int size = length(e.pair());
            if (chars + size > maxChars || !seen.add(e.pair().en().toLowerCase(Locale.ROOT))) {
                continue;
            }
            chars += size;
            chosen.add(e);
        }
        chosen.sort(Comparator.comparingInt(Entry::order));
        return new Result(chosen.stream().map(Entry::pair).toList(),
                (int) chosen.stream().mapToInt(Entry::video).distinct().count(),
                (int) chosen.stream().filter(Entry::corrected).count());
    }

    /** A capitalised word in the middle of a sentence (a name), or a form of address in the Vietnamese. */
    static boolean isNotable(String en, String vi) {
        String[] words = en.split("\\s+");
        for (int i = 1; i < words.length; i++) {
            String previous = words[i - 1];
            char last = previous.charAt(previous.length() - 1);
            boolean sentenceStart = last == '.' || last == '!' || last == '?' || last == ':' || previous.equals("-");
            if (!sentenceStart && NAME_WORD.matcher(words[i]).find()) {
                return true;
            }
        }
        return ADDRESS.matcher(vi).find();
    }

    private static boolean hasContent(String text) {
        return text.codePoints().anyMatch(Character::isLetterOrDigit);
    }

    private static int length(ExamplePair pair) {
        return pair.en().length() + pair.vi().length();
    }

    private record Entry(int order, int video, int tier, ExamplePair pair, boolean corrected) {}
}
