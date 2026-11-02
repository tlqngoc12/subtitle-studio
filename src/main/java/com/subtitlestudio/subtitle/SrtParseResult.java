package com.subtitlestudio.subtitle;

import java.util.List;

/** Parsed .srt entries plus the number of blocks that could not be read. */
public record SrtParseResult(List<SrtEntry> entries, int skippedBlocks) {

    public SrtParseResult {
        entries = List.copyOf(entries);
    }
}
