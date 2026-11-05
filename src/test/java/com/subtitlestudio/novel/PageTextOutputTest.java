package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.translate.TranslationFailedException;
import java.util.List;
import org.junit.jupiter.api.Test;

class PageTextOutputTest {

    private static final List<PageImage> SENT = List.of(new PageImage(3, new byte[1]), new PageImage(4, new byte[1]),
            new PageImage(5, new byte[1]));

    private static String messageOf(List<TranslatedPage> got) {
        try {
            PageTextOutput.validate(SENT, got);
        } catch (TranslationFailedException e) {
            return e.userMessage();
        }
        throw new AssertionError("expected TranslationFailedException");
    }

    @Test
    void acceptsAndSortsAndStrips() {
        List<TranslatedPage> got = PageTextOutput.validate(SENT, List.of(new TranslatedPage(5, " C "),
                new TranslatedPage(3, "A\n"), new TranslatedPage(4, "B")));

        assertThat(got).containsExactly(new TranslatedPage(3, "A"), new TranslatedPage(4, "B"),
                new TranslatedPage(5, "C"));
    }

    @Test
    void checkKeepsTheGoodPagesAndListsTheMissingOnes() {
        PageTextOutput.Check check = PageTextOutput.check(SENT, List.of(new TranslatedPage(5, "Năm"),
                new TranslatedPage(3, "Ba ba"), new TranslatedPage(9, "Lạ"), new TranslatedPage(3, "Trùng")));

        assertThat(check.valid()).containsExactly(new TranslatedPage(3, "Ba ba"), new TranslatedPage(5, "Năm"));
        assertThat(check.missing()).containsExactly(4);
        assertThat(check.description())
                .contains("returned [5, 3, 9, 3]")
                .contains("missing [4]")
                .contains("unexpected [9]")
                .contains("duplicate [3]")
                .contains("chars {3=5, 5=3}")
                .doesNotContain("Ba ba").doesNotContain("Năm");
    }

    @Test
    void checkCountsBlankPagesAsMissing() {
        PageTextOutput.Check check = PageTextOutput.check(SENT, List.of(new TranslatedPage(3, "A"),
                new TranslatedPage(4, "  "), new TranslatedPage(5, "C")));

        assertThat(check.missing()).containsExactly(4);
        assertThat(check.description()).contains("blank [4]");
    }

    @Test
    void rejectsMissingDuplicateOrBlankPagesButIgnoresExtraOnes() {
        assertThat(messageOf(List.of(new TranslatedPage(3, "A"), new TranslatedPage(4, "B"))))
                .isEqualTo("Gemini returned an incomplete translation (got 2 of 3 pages).");
        assertThat(PageTextOutput.validate(SENT, List.of(new TranslatedPage(3, "A"), new TranslatedPage(4, "B"),
                new TranslatedPage(5, "C"), new TranslatedPage(6, "D"))))
                .extracting(TranslatedPage::page).containsExactly(3, 4, 5);
        assertThat(messageOf(List.of(new TranslatedPage(3, "A"), new TranslatedPage(3, "A"),
                new TranslatedPage(5, "C"))))
                .isEqualTo("Gemini returned an incomplete translation (got 2 of 3 pages).");
        assertThat(messageOf(List.of(new TranslatedPage(3, "A"), new TranslatedPage(4, "  "),
                new TranslatedPage(5, "C"))))
                .isEqualTo("Gemini returned an incomplete translation (got 2 of 3 pages).");
        assertThatThrownBy(() -> PageTextOutput.validate(SENT, null)).isInstanceOf(TranslationFailedException.class);
    }
}
