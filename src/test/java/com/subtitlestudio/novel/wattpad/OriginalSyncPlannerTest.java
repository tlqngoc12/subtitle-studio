package com.subtitlestudio.novel.wattpad;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.fanfic.WattpadPart;
import com.subtitlestudio.novel.OriginalChapterState;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class OriginalSyncPlannerTest {

    private static final Instant SYNCED = Instant.parse("2026-11-20T10:00:00Z");
    private static final Instant BEFORE = SYNCED.minusSeconds(3600);
    private static final Instant AFTER = SYNCED.plusSeconds(3600);

    private static WattpadPart part(String id, String title, Instant modified, boolean deleted) {
        return new WattpadPart(id, title, 100, BEFORE, modified, deleted);
    }

    private static WattpadPart part(String id, String title) {
        return part(id, title, BEFORE, false);
    }

    /** A chapter synced from {@code partId} with stored hash "h1"; untouched when {@code current} is "h1". */
    private static OriginalChapterState synced(long id, String title, String partId, boolean published,
                                               String current) {
        return new OriginalChapterState(id, title, published, partId, SYNCED, "h1", current);
    }

    private static OriginalChapterState plain(long id, String title) {
        return new OriginalChapterState(id, title, false, null, null, null, null);
    }

    private static SyncPlanItem only(WattpadSyncPlan plan) {
        assertThat(plan.parts()).hasSize(1);
        return plan.parts().getFirst();
    }

    @Test
    void aDeletedPartIsDeletedWhatEverElse() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "One", AFTER, true)),
                List.of(synced(5, "One", "1", true, "h1")));

        assertThat(only(plan).status()).isEqualTo(SyncStatus.DELETED);
        assertThat(only(plan).chapterId()).isEqualTo(5L);
    }

    @Test
    void aPublishedChapterIsPublishedAndNeverSelectable() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "One", AFTER, false)),
                List.of(synced(5, "One", "1", true, "h1")));

        assertThat(only(plan).status()).isEqualTo(SyncStatus.PUBLISHED);
    }

    @Test
    void aChapterNotEditedAndNotChangedOnWattpadIsUpToDateAndOnlyCounted() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "One", SYNCED, false)),
                List.of(synced(5, "One", "1", false, "h1")));

        assertThat(plan.parts()).isEmpty();
        assertThat(plan.upToDate()).isEqualTo(1);
    }

    @Test
    void aNewerWattpadVersionOfAnUntouchedChapterIsUpdated() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "One", AFTER, false)),
                List.of(synced(5, "One", "1", false, "h1")));

        SyncPlanItem item = only(plan);
        assertThat(item.status()).isEqualTo(SyncStatus.UPDATED);
        assertThat(item.chapterId()).isEqualTo(5L);
        assertThat(item.chapterTitle()).isEqualTo("One");
        assertThat(item.lastSyncedAt()).isEqualTo(SYNCED);
        assertThat(item.modifiedAt()).isEqualTo(AFTER);
        assertThat(item.wordCount()).isEqualTo(100);
        assertThat(plan.upToDate()).isZero();
    }

    @Test
    void wattpadWithoutAModifyDateCountsAsUpdated() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "One", null, false)),
                List.of(synced(5, "One", "1", false, "h1")));

        assertThat(only(plan).status()).isEqualTo(SyncStatus.UPDATED);
    }

    @Test
    void editedInTheAppIsLocalEditsEvenWhenWattpadHasNothingNew() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "One", BEFORE, false)),
                List.of(synced(5, "One", "1", false, "other")));

        assertThat(only(plan).status()).isEqualTo(SyncStatus.LOCAL_EDITS);
    }

    @Test
    void aMissingStoredHashIsLocalEditsToo() {
        OriginalChapterState c = new OriginalChapterState(5, "One", false, "1", SYNCED, null, "x");

        assertThat(only(OriginalSyncPlanner.plan(List.of(part("1", "One")), List.of(c))).status())
                .isEqualTo(SyncStatus.LOCAL_EDITS);
    }

    @Test
    void aTitleMatchWithoutASyncIsNotSynced() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "  mở   ĐẦU ")),
                List.of(plain(5, "Mở đầu")));

        SyncPlanItem item = only(plan);
        assertThat(item.status()).isEqualTo(SyncStatus.NOT_SYNCED);
        assertThat(item.chapterId()).isEqualTo(5L);
        assertThat(item.lastSyncedAt()).isNull();
    }

    @Test
    void aTitleMatchOnAPublishedChapterIsPublished() {
        assertThat(only(OriginalSyncPlanner.plan(List.of(part("1", "One")),
                List.of(new OriginalChapterState(5, "One", true, null, null, null, null)))).status())
                .isEqualTo(SyncStatus.PUBLISHED);
    }

    @Test
    void aPartWithNoChapterIsNewPart() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "Brand new")), List.of(plain(5, "Other")));

        SyncPlanItem item = only(plan);
        assertThat(item.status()).isEqualTo(SyncStatus.NEW_PART);
        assertThat(item.chapterId()).isNull();
        assertThat(item.chapterTitle()).isNull();
    }

    @Test
    void theIdMatchBeatsTheTitleMatch() {
        // Chapter 6 is titled like part 1 but chapter 5 was synced from part 1.
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "Same", AFTER, false)),
                List.of(plain(6, "Same"), synced(5, "Renamed", "1", false, "h1")));

        assertThat(only(plan).chapterId()).isEqualTo(5L);
        assertThat(only(plan).status()).isEqualTo(SyncStatus.UPDATED);
    }

    @Test
    void severalChaptersWithTheTitleGiveTheEarlierOneAndEachChapterIsUsedOnce() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "Same"), part("2", "Same")),
                List.of(plain(7, "Same"), plain(8, "Same")));

        assertThat(plan.parts()).extracting(SyncPlanItem::chapterId).containsExactly(7L, 8L);
    }

    @Test
    void aChapterSyncedFromAnotherPartIsNeverMatchedByTitle() {
        // Chapter 5 belongs to part 9, which is still on Wattpad; part 1 only shares its title.
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "One"), part("9", "Nine", SYNCED, false)),
                List.of(synced(5, "One", "9", false, "h1")));

        assertThat(only(plan).partId()).isEqualTo("1");
        assertThat(only(plan).status()).isEqualTo(SyncStatus.NEW_PART);
        assertThat(plan.upToDate()).isEqualTo(1);
    }

    @Test
    void aChapterOfAPartGoneFromWattpadIsLeftAlone() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("1", "One")),
                List.of(synced(5, "One", "gone", false, "h1")));

        assertThat(only(plan).status()).isEqualTo(SyncStatus.NEW_PART);
    }

    @Test
    void aDeletedPartDoesNotTakeAChapterByTitle() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(
                List.of(part("1", "One", BEFORE, true), part("2", "One")), List.of(plain(5, "One")));

        assertThat(plan.parts()).extracting(SyncPlanItem::status)
                .containsExactly(SyncStatus.DELETED, SyncStatus.NOT_SYNCED);
        assertThat(plan.parts().get(0).chapterId()).isNull();
        assertThat(plan.parts().get(1).chapterId()).isEqualTo(5L);
    }

    @Test
    void keepsWattpadOrder() {
        WattpadSyncPlan plan = OriginalSyncPlanner.plan(List.of(part("3", "C"), part("1", "A"), part("2", "B")),
                List.of());

        assertThat(plan.parts()).extracting(SyncPlanItem::partId).containsExactly("3", "1", "2");
    }
}
