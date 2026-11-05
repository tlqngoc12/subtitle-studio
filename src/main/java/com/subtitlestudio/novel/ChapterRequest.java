package com.subtitlestudio.novel;

/** Add a chapter; a null {@code chapterNo} means the highest number + 1. */
public record ChapterRequest(Integer chapterNo, String title) {
}
