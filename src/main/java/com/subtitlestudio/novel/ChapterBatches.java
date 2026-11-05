package com.subtitlestudio.novel;

import java.util.ArrayList;
import java.util.List;

/** Splits a chapter's pages into Gemini requests: at most {@code maxPages} pages and about {@code maxBytes} each. */
final class ChapterBatches {

    static final long MAX_BYTES = 15L * 1024 * 1024;

    private ChapterBatches() {
    }

    /** A single page larger than {@code maxBytes} still goes, alone. Page order is kept. */
    static List<List<PageImage>> split(List<PageImage> pages, int maxPages, long maxBytes) {
        List<List<PageImage>> batches = new ArrayList<>();
        List<PageImage> current = new ArrayList<>();
        long bytes = 0;
        for (PageImage p : pages) {
            boolean full = current.size() >= maxPages || (!current.isEmpty() && bytes + p.jpeg().length > maxBytes);
            if (full) {
                batches.add(current);
                current = new ArrayList<>();
                bytes = 0;
            }
            current.add(p);
            bytes += p.jpeg().length;
        }
        if (!current.isEmpty()) {
            batches.add(current);
        }
        return batches;
    }
}
