package com.subtitlestudio.novel.wattpad;

import java.util.List;

/** What an import did: parts turned into chapters, parts skipped (already imported), parts that failed and why. */
public record WattpadImportResult(List<Imported> imported, List<String> skipped, List<Failure> failed) {

    /** {@code skippedImages}: images of the part that could not be downloaded (the chapter was still created). */
    public record Imported(String partId, long chapterId, int skippedImages) {

        public Imported(String partId, long chapterId) {
            this(partId, chapterId, 0);
        }
    }

    public record Failure(String partId, String title, String reason) {
    }
}
