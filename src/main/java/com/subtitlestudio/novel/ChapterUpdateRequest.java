package com.subtitlestudio.novel;

import java.util.List;

/** Edit a chapter; null fields are left as they are. */
public record ChapterUpdateRequest(Integer chapterNo, String title, List<PageTextEdit> pages) {
}
