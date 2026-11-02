package com.subtitlestudio.subtitle;

import java.util.List;

/** A cue as read from a .vtt file: timing in milliseconds and cleaned text lines (tags stripped, entities decoded). */
public record RawCue(long startMs, long endMs, List<String> lines) {

    public RawCue {
        lines = List.copyOf(lines);
    }
}
