package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class TextSplitterTest {

    private static String para(int n, int chars) {
        return ("P" + n + " ").repeat(Math.max(1, chars / 4)).strip();
    }

    @Test
    void splitsAtTheSceneBreakClosestToTheMiddle() {
        String text = String.join("\n\n", para(1, 100), "***", para(2, 400), "* * *", para(3, 400), "---", para(4, 100));

        List<String> halves = TextSplitter.split(text);

        assertThat(halves).hasSize(2);
        assertThat(halves.get(0)).endsWith("* * *").contains("***").doesNotContain("P3");
        assertThat(halves.get(1)).startsWith("P3").contains("---");
    }

    @Test
    void aSceneBreakWinsOverACloserParagraphBoundary() {
        String text = String.join("\n\n", para(1, 100), para(2, 100), "***", para(3, 900), para(4, 100));

        List<String> halves = TextSplitter.split(text);

        assertThat(halves.get(0)).endsWith("***");
        assertThat(halves.get(1)).startsWith("P3");
    }

    @Test
    void withoutASceneBreakItSplitsAtTheParagraphBoundaryClosestToTheMiddle() {
        String text = String.join("\n\n", para(1, 100), para(2, 100), para(3, 100), para(4, 100), para(5, 100),
                para(6, 100));

        List<String> halves = TextSplitter.split(text);

        assertThat(halves.get(0)).endsWith(para(3, 100)).doesNotContain("P4");
        assertThat(halves.get(1)).startsWith("P4");
    }

    @Test
    void neverSplitsInsideAParagraph() {
        String text = para(1, 100) + "\n\n" + para(2, 5000) + "\n\n" + para(3, 100);

        List<String> halves = TextSplitter.split(text);

        assertThat(halves).hasSize(2);
        assertThat(halves.get(0) + "\n\n" + halves.get(1)).isEqualTo(text);
        assertThat(halves).allSatisfy(h -> assertThat(TextSplitter.paragraphs(h)).isNotEmpty());
    }

    @Test
    void aLeadingSceneBreakIsNotASplitPoint() {
        List<String> halves = TextSplitter.split("***\n\nOne\n\nTwo");

        assertThat(halves).hasSize(2);
        assertThat(halves.get(0)).startsWith("***").contains("One");
    }

    @Test
    void aSingleParagraphCannotBeSplit() {
        assertThat(TextSplitter.split("Only one paragraph\nwith two lines")).isEmpty();
        assertThat(TextSplitter.split("")).isEmpty();
    }

    @Test
    void twoParagraphsSplitBetweenThem() {
        assertThat(TextSplitter.split("A\n\nB")).containsExactly("A", "B");
    }
}
