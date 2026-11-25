package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.novel.ChapterTitles.LegacyChapter;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ChapterTitlesTest {

    @Test
    void reviewKeyOfNumberedChapter() {
        for (String t : List.of("Chương 7: Bữa cơm hai người", "chương 07: X", "CHAPTER 7", "Chương 7")) {
            assertThat(ChapterTitles.reviewKey(t)).as(t).isEqualTo(Optional.of("ch-7"));
        }
    }

    @Test
    void reviewKeyOfNamedChapter() {
        assertThat(ChapterTitles.reviewKey("Ngoại truyện I: Lần này")).contains("ngoai-truyen-i");
        assertThat(ChapterTitles.reviewKey("Nhân vật")).contains("nhan-vat");
        assertThat(ChapterTitles.reviewKey("Special II")).contains("special-ii");
        assertThat(ChapterTitles.reviewKey("Đêm mưa")).contains("dem-mua");
    }

    @Test
    void reviewKeyEmptyForSymbolsOnly() {
        assertThat(ChapterTitles.reviewKey("💜")).isEmpty();
    }

    @Test
    void defaultTitleContinuesHighestNumber() {
        List<String> existing = List.of("Nhân vật", "Chương 1: A", "Chương 4", "Ngoại truyện I");
        assertThat(ChapterTitles.defaultTitle(existing, null)).isEqualTo("Chương 5");
        assertThat(ChapterTitles.defaultTitle(existing, "The rain")).isEqualTo("Chương 5: The rain");
        assertThat(ChapterTitles.defaultTitle(List.of(), "  ")).isEqualTo("Chương 1");
    }

    @Test
    void migrateFollowsReadingOrder() {
        List<String> out = ChapterTitles.migrate(List.of(
                new LegacyChapter("Nhân vật", null),
                new LegacyChapter(null, "Người đứng sau cô"),
                new LegacyChapter(null, "B"),
                new LegacyChapter(null, "C"),
                new LegacyChapter("Chương 4", "14 năm trước"),
                new LegacyChapter("Ngoại truyện I", null)));
        assertThat(out).containsExactly("Nhân vật", "Chương 1: Người đứng sau cô", "Chương 2: B", "Chương 3: C",
                "Chương 4: 14 năm trước", "Ngoại truyện I");
    }

    @Test
    void migrateUntilISeeYouShape() {
        List<String> out = ChapterTitles.migrate(List.of(
                new LegacyChapter(null, "a"), new LegacyChapter(null, "b"), new LegacyChapter(null, "c"),
                new LegacyChapter("Chương 4", "d"), new LegacyChapter("Chương 5", "e"),
                new LegacyChapter("Chương 6", "f"), new LegacyChapter("Chương 7", "g"),
                new LegacyChapter(null, "h")));
        assertThat(out.get(7)).isEqualTo("Chương 8: h");
    }

    @Test
    void migrateDefaultLabelOnly() {
        assertThat(ChapterTitles.migrate(List.of(new LegacyChapter(null, null)))).containsExactly("Chương 1");
    }
}
