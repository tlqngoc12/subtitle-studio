package com.subtitlestudio.video;

/**
 * Outcome of {@link SubtitleService#fetch}.
 *
 * @param created true if the video was imported now, false if it was already stored
 */
public record FetchResult(Video video, boolean created) {}
