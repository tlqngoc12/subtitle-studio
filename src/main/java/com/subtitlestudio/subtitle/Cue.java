package com.subtitlestudio.subtitle;

/** A cleaned subtitle cue ready to store or export. */
public record Cue(long startMs, long endMs, String text) {}
