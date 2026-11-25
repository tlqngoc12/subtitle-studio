package com.subtitlestudio.publish;

import java.util.List;

/**
 * A published chapter: its drawn page images and the neighbouring published chapter numbers. Never text. {@code images} is the "s" format, kept for files published before {@code formats}.
 */
public record PublicChapterFile(int chapterNo, String title, Integer prev, Integer next, List<String> images,
                                List<PublicPageFormat> formats) {
}
