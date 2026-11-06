package com.subtitlestudio.publish;

import java.util.List;

/**
 * A published chapter: its drawn page images and the neighbouring published chapter numbers. Never text. {@code label}
 * is shown instead of "Chapter N" when set.
 */
public record PublicChapterFile(int chapterNo, String title, String label, Integer prev, Integer next, List<String> images) {
}
