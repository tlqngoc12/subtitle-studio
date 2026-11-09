package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class SuspectPagesTest {

    private static final String SOURCE = "ก".repeat(200);

    private static String text(double ratio) {
        return "a".repeat((int) Math.round(SOURCE.length() * ratio));
    }

    private static List<ChapterPage> pagesWithRatios(double... ratios) {
        List<ChapterPage> list = new ArrayList<>();
        for (double r : ratios) {
            ChapterPage p = new ChapterPage(null, list.size() + 1, null);
            p.setTextVi(text(r));
            p.setSourceTh(SOURCE);
            list.add(p);
        }
        return list;
    }

    @Test
    void usesSixtyPercentOfTheNovelMedianWithFiveSamples() {
        Double median = SuspectPages.novelMedian(pagesWithRatios(1.0, 1.1, 1.2, 0.9, 1.0));

        assertThat(median).isEqualTo(1.0);
        assertThat(SuspectPages.suspect(text(0.55), SOURCE, median)).isTrue();
        assertThat(SuspectPages.suspect(text(0.65), SOURCE, median)).isFalse();
    }

    @Test
    void fewerThanFiveSamplesUseTheFixedFloor() {
        Double median = SuspectPages.novelMedian(pagesWithRatios(1.0, 1.1, 1.2, 0.9));

        assertThat(median).isNull();
        assertThat(SuspectPages.suspect(text(0.45), SOURCE, median)).isTrue();
        assertThat(SuspectPages.suspect(text(0.55), SOURCE, median)).isFalse();
    }

    @Test
    void shortOrMissingSourceIsNeverSuspect() {
        assertThat(SuspectPages.suspect("a", "ก".repeat(99), null)).isFalse();
        assertThat(SuspectPages.suspect("a", null, null)).isFalse();
        assertThat(SuspectPages.suspect("a", "   ", null)).isFalse();
        assertThat(SuspectPages.suspect(null, SOURCE, null)).isFalse();
        assertThat(SuspectPages.suspect(" ", SOURCE, null)).isFalse();
    }

    @Test
    void pagesWithoutTextOrWithShortSourceDoNotCountForTheMedian() {
        List<ChapterPage> list = pagesWithRatios(1.0, 1.0, 1.0, 1.0);
        ChapterPage noText = new ChapterPage(null, 5, null);
        noText.setSourceTh(SOURCE);
        ChapterPage shortSource = new ChapterPage(null, 6, null);
        shortSource.setTextVi("a");
        shortSource.setSourceTh("ก");
        list.add(noText);
        list.add(shortSource);

        assertThat(SuspectPages.novelMedian(list)).isNull();
    }

    @Test
    void ratioIsTextOverSourceLength() {
        assertThat(SuspectPages.ratio("  abcd ", "ก".repeat(8))).isEqualTo(0.5);
    }
}
