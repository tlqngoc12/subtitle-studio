package com.subtitlestudio.novel.wattpad;

import java.time.Instant;

/**
 * One Wattpad part of the sync plan. {@code chapterId} and {@code chapterTitle} name the chapter it matches (null for
 * a new part); {@code lastSyncedAt} is that chapter's last sync (null if it never was).
 */
public record SyncPlanItem(String partId, String title, Instant modifiedAt, int wordCount, SyncStatus status,
                           Long chapterId, String chapterTitle, Instant lastSyncedAt) {
}
