package com.subtitlestudio.novel;

import java.time.Instant;

/**
 * What the Wattpad sync needs to know about a chapter of an original story: its sync marks and whether its text still
 * is the one that was synced ({@code currentHash} is computed only for a chapter that has a part id, else null).
 */
public record OriginalChapterState(long id, String title, boolean published, String originalPartId,
                                   Instant sourceFetchedAt, String syncedHash, String currentHash) {
}
