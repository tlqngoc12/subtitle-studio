package com.subtitlestudio.video;

/** JSON view of one cue for the preview table; {@code idx} is 0-based. */
public record CueDto(int idx, long startMs, long endMs, String text) {}
