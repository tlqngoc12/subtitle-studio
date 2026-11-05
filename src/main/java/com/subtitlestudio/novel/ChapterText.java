package com.subtitlestudio.novel;

import java.util.List;

/**
 * The chapter's text everyone reads (export, notebook, the next chapter's context): the whole-chapter text once it
 * was edited, otherwise the page texts joined with a blank line.
 */
public final class ChapterText {

    private ChapterText() {
    }

    public static String of(Chapter chapter, List<ChapterPage> pages) {
        if (hasText(chapter.getTextVi())) {
            return chapter.getTextVi();
        }
        return String.join("\n\n", pages.stream().map(ChapterPage::getTextVi).filter(ChapterText::hasText).toList());
    }

    /** Ready to publish or to read from: an edited whole text, or text on every page. */
    public static boolean complete(Chapter chapter, List<ChapterPage> pages) {
        if (hasText(chapter.getTextVi())) {
            return true;
        }
        return !pages.isEmpty() && pages.stream().allMatch(p -> hasText(p.getTextVi()));
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
