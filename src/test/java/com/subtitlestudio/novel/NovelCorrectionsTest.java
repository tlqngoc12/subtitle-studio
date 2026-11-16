package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.novel.NovelCorrections.Edit;
import java.util.List;
import org.junit.jupiter.api.Test;

class NovelCorrectionsTest {

    @Test
    void unchangedTextHasNoEdits() {
        assertThat(NovelCorrections.edits("A\n\nB", "A\n\nB", null)).isEmpty();
    }

    @Test
    void whitespaceOnlyChangesAreNotEdits() {
        assertThat(NovelCorrections.edits("A\n\nB  \n\nC", "A\r\n\r\nB\r\n\r\n\r\nC  ", null)).isEmpty();
        assertThat(NovelCorrections.edits("A b  c", "A b c", null)).isEmpty();
    }

    @Test
    void oneChangedParagraphIsOneEdit() {
        assertThat(NovelCorrections.edits("A\n\nB\n\nC", "A\n\nB2\n\nC", null))
                .containsExactly(new Edit(null, "B", "B2"));
    }

    @Test
    void insertedAndDeletedParagraphs() {
        assertThat(NovelCorrections.edits("A\n\nC", "A\n\nX\n\nC", null)).containsExactly(new Edit(null, "", "X"));
        assertThat(NovelCorrections.edits("A\n\nB\n\nC", "A\n\nC", null)).containsExactly(new Edit(null, "B", ""));
    }

    @Test
    void mergedParagraphsBecomeOneEdit() {
        assertThat(NovelCorrections.edits("A\n\nB\n\nC\n\nD", "A\n\nBC merged\n\nD", null))
                .containsExactly(new Edit(null, "B\n\nC", "BC merged"));
    }

    @Test
    void sourceAttachedOnlyWhenParagraphCountsMatch() {
        String ai = "a1\n\na2\n\na3\n\na4";
        String fin = "a1\n\na2x\n\na3\n\na4";
        assertThat(NovelCorrections.edits(ai, fin, "s1\n\ns2\n\ns3\n\ns4"))
                .containsExactly(new Edit("s2", "a2", "a2x"));
        assertThat(NovelCorrections.edits(ai, "a1\n\nx\n\ny\n\na4", "s1\n\ns2\n\ns3\n\ns4"))
                .containsExactly(new Edit("s2\n\ns3", "a2\n\na3", "x\n\ny"));
        assertThat(NovelCorrections.edits(ai, fin, "s1\n\ns2\n\ns3\n\ns4\n\ns5"))
                .extracting(Edit::source).containsOnlyNulls();
    }

    @Test
    void insertionHasNoSource() {
        assertThat(NovelCorrections.edits("A\n\nC", "A\n\nX\n\nC", "a\n\nc")).containsExactly(new Edit(null, "", "X"));
    }

    @Test
    void paragraphsSplitOnBlankLinesAndDropEmpty() {
        assertThat(NovelCorrections.paragraphs("  A \r\n\r\n\r\n B\nline2 \n\n\n")).isEqualTo(List.of("A", "B\nline2"));
        assertThat(NovelCorrections.paragraphs(null)).isEmpty();
    }
}
