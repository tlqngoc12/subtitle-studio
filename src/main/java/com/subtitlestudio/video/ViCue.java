package com.subtitlestudio.video;

/** One Vietnamese subtitle line, timed by the uploaded .srt file. */
public record ViCue(long startMs, long endMs, String text) {}
