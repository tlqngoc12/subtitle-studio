package com.subtitlestudio.translate;

/** One English subtitle block sent to Gemini; {@code id} is the cue index. */
public record SourceLine(int id, String text) {}
