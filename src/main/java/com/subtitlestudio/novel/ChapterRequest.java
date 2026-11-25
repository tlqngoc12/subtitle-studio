package com.subtitlestudio.novel;

/** Add a chapter; a blank {@code title} becomes "Chương N" (N = the highest number in the novel + 1). */
public record ChapterRequest(String title) {
}
