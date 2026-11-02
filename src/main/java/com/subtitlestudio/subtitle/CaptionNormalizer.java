package com.subtitlestudio.subtitle;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Turns parsed {@link RawCue}s into clean, non-overlapping {@link Cue}s.
 *
 * <p>For {@link SourceType#AUTO} it removes YouTube's "rolling" duplicates: each cue repeats the
 * previous line and adds a new one, plus ~10ms cues that repeat a line verbatim. For
 * {@link SourceType#MANUAL} only timing clamps and whitespace cleanup are applied.
 *
 * <p>Optionally merges consecutive short segments so each output cue is a complete thought
 * (on by default for AUTO, off for MANUAL).
 */
@Component
public class CaptionNormalizer {

    static final long MIN_RAW_DURATION_MS = 50;
    static final long MIN_DURATION_MS = 300;
    static final int MAX_MERGED_CHARS = 84; // 2 lines x 42 chars
    static final long MAX_MERGE_GAP_MS = 1_000;
    static final long MAX_MERGED_DURATION_MS = 7_000;

    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    public List<Cue> normalize(List<RawCue> raw, SourceType type) {
        return normalize(raw, type, type == SourceType.AUTO);
    }

    public List<Cue> normalize(List<RawCue> raw, SourceType type, boolean mergeShortLines) {
        List<RawCue> sorted = raw.stream().sorted(Comparator.comparingLong(RawCue::startMs)).toList();

        List<Cue> segments = type == SourceType.AUTO ? dedupeRolling(sorted) : fromManual(sorted);
        segments = combineSameStart(segments, type == SourceType.AUTO ? " " : "\n");
        segments = clampTimings(segments);
        return mergeShortLines ? mergeShort(segments) : segments;
    }

    /** Emits each line once, starting when it first appears and ending when it leaves the screen. */
    private static List<Cue> dedupeRolling(List<RawCue> cues) {
        List<Segment> segments = new ArrayList<>();
        Map<String, Segment> previousCueLines = Map.of();

        for (RawCue cue : cues) {
            if (cue.endMs() - cue.startMs() < MIN_RAW_DURATION_MS) {
                continue;
            }
            Map<String, Segment> currentCueLines = new HashMap<>();
            List<String> newLines = new ArrayList<>();
            for (String rawLine : cue.lines()) {
                String line = collapse(rawLine);
                if (line.isEmpty() || currentCueLines.containsKey(line)) {
                    continue;
                }
                Segment shownBefore = previousCueLines.get(line);
                if (shownBefore != null) {
                    // Still on screen from the previous cue: extend its visibility, don't emit again.
                    shownBefore.lastSeenEnd = Math.max(shownBefore.lastSeenEnd, cue.endMs());
                    currentCueLines.put(line, shownBefore);
                } else {
                    newLines.add(line);
                    currentCueLines.put(line, null); // placeholder, filled below
                }
            }
            if (!newLines.isEmpty()) {
                Segment segment = new Segment(cue.startMs(), cue.endMs(), String.join(" ", newLines));
                segments.add(segment);
                newLines.forEach(l -> currentCueLines.put(l, segment));
            }
            previousCueLines = currentCueLines;
        }

        List<Cue> result = new ArrayList<>(segments.size());
        for (int i = 0; i < segments.size(); i++) {
            Segment s = segments.get(i);
            long end = i + 1 < segments.size()
                    ? Math.min(segments.get(i + 1).start, s.lastSeenEnd)
                    : s.lastSeenEnd;
            result.add(new Cue(s.start, end, s.text));
        }
        return result;
    }

    private static List<Cue> fromManual(List<RawCue> cues) {
        List<Cue> result = new ArrayList<>(cues.size());
        for (RawCue cue : cues) {
            List<String> lines = cue.lines().stream()
                    .map(CaptionNormalizer::collapse)
                    .filter(l -> !l.isEmpty())
                    .toList();
            if (!lines.isEmpty()) {
                result.add(new Cue(cue.startMs(), cue.endMs(), String.join("\n", lines)));
            }
        }
        return result;
    }

    /** Cues sharing a start time would collapse to zero length after clamping, so join them. */
    private static List<Cue> combineSameStart(List<Cue> cues, String joiner) {
        List<Cue> result = new ArrayList<>(cues.size());
        for (Cue cue : cues) {
            int last = result.size() - 1;
            if (last >= 0 && result.get(last).startMs() == cue.startMs()) {
                Cue prev = result.get(last);
                result.set(last, new Cue(prev.startMs(), Math.max(prev.endMs(), cue.endMs()),
                        prev.text() + joiner + cue.text()));
            } else {
                result.add(cue);
            }
        }
        return result;
    }

    /** Ensures end > start, a minimum duration of 300ms, and no overlap with the next cue. */
    private static List<Cue> clampTimings(List<Cue> cues) {
        List<Cue> result = new ArrayList<>(cues.size());
        for (int i = 0; i < cues.size(); i++) {
            Cue cue = cues.get(i);
            long end = Math.max(cue.endMs(), cue.startMs() + MIN_DURATION_MS);
            if (i + 1 < cues.size()) {
                end = Math.min(end, cues.get(i + 1).startMs());
            }
            result.add(new Cue(cue.startMs(), end, cue.text()));
        }
        return result;
    }

    /** Greedily joins consecutive cues while length, gap and total duration stay within limits. */
    private static List<Cue> mergeShort(List<Cue> cues) {
        List<Cue> result = new ArrayList<>();
        Cue current = null;
        for (Cue next : cues) {
            if (current == null) {
                current = next;
                continue;
            }
            String joined = flatten(current.text()) + " " + flatten(next.text());
            boolean fits = joined.length() <= MAX_MERGED_CHARS
                    && next.startMs() - current.endMs() < MAX_MERGE_GAP_MS
                    && next.endMs() - current.startMs() <= MAX_MERGED_DURATION_MS;
            if (fits) {
                current = new Cue(current.startMs(), next.endMs(), joined);
            } else {
                result.add(current);
                current = next;
            }
        }
        if (current != null) {
            result.add(current);
        }
        return result;
    }

    private static String collapse(String line) {
        return WHITESPACE.matcher(line).replaceAll(" ").strip();
    }

    private static String flatten(String text) {
        return text.replace('\n', ' ');
    }

    private static final class Segment {
        final long start;
        long lastSeenEnd;
        final String text;

        Segment(long start, long lastSeenEnd, String text) {
            this.start = start;
            this.lastSeenEnd = lastSeenEnd;
            this.text = text;
        }
    }
}
