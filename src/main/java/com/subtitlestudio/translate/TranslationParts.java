package com.subtitlestudio.translate;

import java.util.ArrayList;
import java.util.List;

/** Splits the cues of a long video into parts that start on cue boundaries. */
final class TranslationParts {

    /** Cues {@code from} (inclusive) to {@code to} (exclusive). */
    record Range(int from, int to) {
        int size() {
            return to - from;
        }
    }

    private TranslationParts() {}

    /**
     * A cue joins the current part while it starts less than {@code partMs} after the part's first cue; otherwise
     * it starts a new part. A cue is never split and no part is empty.
     *
     * @param startsMs start time of every cue, in order
     */
    static List<Range> split(List<Long> startsMs, long partMs) {
        List<Range> parts = new ArrayList<>();
        int from = 0;
        for (int i = 1; i < startsMs.size(); i++) {
            if (startsMs.get(i) - startsMs.get(from) >= partMs) {
                parts.add(new Range(from, i));
                from = i;
            }
        }
        if (!startsMs.isEmpty()) {
            parts.add(new Range(from, startsMs.size()));
        }
        return parts;
    }
}
