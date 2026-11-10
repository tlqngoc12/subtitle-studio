package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DescriptionCleanerTest {

    @Test
    void keepsPlotAndCastLines() {
        String text = "Moonshadow episode 3\nCast: Emi as Mon, Bonnie as Nam";

        assertThat(DescriptionCleaner.clean(text)).isEqualTo(text);
    }

    @Test
    void dropsUrlOnlyHashtagOnlyAndMentionOnlyLines() {
        String text = "Plot line\nhttps://example.com/watch?v=abc\nwww.example.com\n#Moonshadow #GL\n@emi @bonnie\nCast: Emi";

        assertThat(DescriptionCleaner.clean(text)).isEqualTo("Plot line\nCast: Emi");
    }

    @Test
    void keepsALineThatMerelyContainsAUrl() {
        assertThat(DescriptionCleaner.clean("Watch the full series: https://example.com"))
                .isEqualTo("Watch the full series: https://example.com");
    }

    @Test
    void dropsPromotionalLines() {
        String text = "Plot line\nSubscribe to our channel!\nFollow us on Instagram\nOfficial Facebook page\n© 2026 Studio\nCast: Emi";

        assertThat(DescriptionCleaner.clean(text)).isEqualTo("Plot line\nCast: Emi");
    }

    @Test
    void collapsesBlankLinesAndNormalizesLineEnds() {
        assertThat(DescriptionCleaner.clean("A\r\n\r\n\r\n\r\nB\n\n\n\nC")).isEqualTo("A\n\nB\n\nC");
    }

    @Test
    void trimsLeadingAndTrailingBlankLines() {
        assertThat(DescriptionCleaner.clean("\n\n  A  \n\n")).isEqualTo("A");
    }

    @Test
    void capsAt1500Chars() {
        String cleaned = DescriptionCleaner.clean("x".repeat(3000));

        assertThat(cleaned).hasSize(DescriptionCleaner.MAX_CHARS).hasSize(1500);
    }

    @Test
    void returnsNullWhenNothingIsLeft() {
        assertThat(DescriptionCleaner.clean(null)).isNull();
        assertThat(DescriptionCleaner.clean("   \n ")).isNull();
        assertThat(DescriptionCleaner.clean("https://a.example\n#tag\nSubscribe!")).isNull();
    }
}
