package com.subtitlestudio.novel.wattpad;

import java.util.List;

/** What an import did: parts turned into chapters, parts skipped (already imported), parts that failed and why. */
public record WattpadImportResult(List<Imported> imported, List<String> skipped, List<Failure> failed) {

    public record Imported(String partId, long chapterId) {
    }

    public record Failure(String partId, String title, String reason) {
    }
}
