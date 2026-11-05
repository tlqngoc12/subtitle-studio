package com.subtitlestudio.publish;

import java.util.List;

/** A published chapter: its drawn page images and the neighbouring published chapter numbers. Never text. */
public record PublicChapterFile(int chapterNo, String title, Integer prev, Integer next, List<String> images) {
}
