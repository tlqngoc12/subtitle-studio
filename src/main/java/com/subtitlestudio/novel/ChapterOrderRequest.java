package com.subtitlestudio.novel;

import java.util.List;

/** The novel's chapters in their new reading order: every chapter id exactly once. */
public record ChapterOrderRequest(List<Long> chapterIds) {
}
