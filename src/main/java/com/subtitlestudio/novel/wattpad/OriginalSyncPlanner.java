package com.subtitlestudio.novel.wattpad;

import com.subtitlestudio.fanfic.WattpadPart;
import com.subtitlestudio.novel.OriginalChapterState;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Pure: matches the parts of a Wattpad story to the chapters of an original story and gives each a status. A chapter
 * matches by the part id it was synced from; failing that, a chapter with no part id and the same title (the earlier
 * in reading order wins). No I/O.
 */
public final class OriginalSyncPlanner {

    private OriginalSyncPlanner() {}

    /** The same rule as the "Same title" label on the chapter page: trim, collapse spaces, NFC, ignore case. */
    static String normalizeTitle(String title) {
        return Normalizer.normalize(title == null ? "" : title, Normalizer.Form.NFC).strip()
                .replaceAll("\s+", " ").toLowerCase(Locale.ROOT);
    }

    /** {@code parts} in Wattpad order, {@code chapters} in reading order. */
    public static WattpadSyncPlan plan(List<WattpadPart> parts, List<OriginalChapterState> chapters) {
        Map<String, OriginalChapterState> byPart = new HashMap<>();
        for (OriginalChapterState c : chapters) {
            if (c.originalPartId() != null) {
                byPart.putIfAbsent(c.originalPartId(), c);
            }
        }
        Set<Long> claimed = new HashSet<>();
        for (WattpadPart p : parts) {
            OriginalChapterState c = byPart.get(p.id());
            if (c != null) {
                claimed.add(c.id());
            }
        }
        List<SyncPlanItem> items = new ArrayList<>();
        int upToDate = 0;
        for (WattpadPart p : parts) {
            OriginalChapterState byId = byPart.get(p.id());
            OriginalChapterState chapter = byId;
            if (chapter == null && !p.deleted()) {
                String wanted = normalizeTitle(p.title());
                for (OriginalChapterState c : chapters) {
                    if (c.originalPartId() == null && !claimed.contains(c.id())
                            && normalizeTitle(c.title()).equals(wanted)) {
                        chapter = c;
                        claimed.add(c.id());
                        break;
                    }
                }
            }
            SyncStatus status = status(p, chapter, byId != null);
            if (status == SyncStatus.UP_TO_DATE) {
                upToDate++;
                continue;
            }
            items.add(new SyncPlanItem(p.id(), p.title(), p.modifiedAt(), p.wordCount(), status,
                    chapter == null ? null : chapter.id(), chapter == null ? null : chapter.title(),
                    chapter == null ? null : chapter.sourceFetchedAt()));
        }
        return new WattpadSyncPlan(items, upToDate);
    }

    private static SyncStatus status(WattpadPart part, OriginalChapterState chapter, boolean matchedById) {
        if (part.deleted()) {
            return SyncStatus.DELETED;
        }
        if (chapter == null) {
            return SyncStatus.NEW_PART;
        }
        if (chapter.published()) {
            return SyncStatus.PUBLISHED;
        }
        if (!matchedById) {
            return SyncStatus.NOT_SYNCED;
        }
        if (chapter.syncedHash() == null || !Objects.equals(chapter.syncedHash(), chapter.currentHash())) {
            return SyncStatus.LOCAL_EDITS;
        }
        boolean changed = part.modifiedAt() == null || chapter.sourceFetchedAt() == null
                || part.modifiedAt().isAfter(chapter.sourceFetchedAt());
        return changed ? SyncStatus.UPDATED : SyncStatus.UP_TO_DATE;
    }
}
