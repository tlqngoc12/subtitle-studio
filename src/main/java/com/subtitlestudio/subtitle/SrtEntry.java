package com.subtitlestudio.subtitle;

/** One block of a .srt file; {@code text} lines are stripped and joined with '\n'. */
public record SrtEntry(int index, long startMs, long endMs, String text) {}
