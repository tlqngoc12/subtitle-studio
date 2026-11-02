package com.subtitlestudio.subtitle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class SrtWriterTest {

    private static final String ID = "dQw4w9WgXcQ";

    private final SrtWriter writer = new SrtWriter();

    @Nested
    class Timestamp {

        @ParameterizedTest(name = "{0} ms -> {1}")
        @CsvSource(delimiter = '|', value = {
                "0          | 00:00:00,000",
                "1          | 00:00:00,001",
                "3723456    | 01:02:03,456",
                "3599999    | 00:59:59,999",
                "35999999   | 09:59:59,999",
                "36000000   | 10:00:00,000",
                "360000000  | 100:00:00,000",
        })
        void formatsAsHoursMinutesSecondsCommaMillis(long ms, String expected) {
            assertThat(SrtWriter.formatTimestamp(ms)).isEqualTo(expected);
        }

        @Test
        void usesAsciiDigitsRegardlessOfDefaultLocale() {
            java.util.Locale original = java.util.Locale.getDefault();
            try {
                java.util.Locale.setDefault(java.util.Locale.forLanguageTag("ar-EG-u-nu-arab"));
                assertThat(SrtWriter.formatTimestamp(3_723_456)).isEqualTo("01:02:03,456");
            } finally {
                java.util.Locale.setDefault(original);
            }
        }

        @Test
        void rejectsNegativeTime() {
            assertThatThrownBy(() -> SrtWriter.formatTimestamp(-1)).isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    class Write {

        @Test
        void writesNumberedBlocksSeparatedByBlankLineWithCrlf() {
            List<Cue> cues = List.of(
                    new Cue(1_000, 3_510, "so today we're going to talk"),
                    new Cue(3_510, 6_010, "about dependency injection"));

            assertThat(writer.write(cues)).isEqualTo(
                    "1\r\n00:00:01,000 --> 00:00:03,510\r\nso today we're going to talk\r\n\r\n"
                            + "2\r\n00:00:03,510 --> 00:00:06,010\r\nabout dependency injection\r\n\r\n");
        }

        @Test
        void indexStartsAtOneAndIncrementsByOne() {
            List<Cue> cues = List.of(new Cue(0, 1_000, "a"), new Cue(1_000, 2_000, "b"), new Cue(2_000, 3_000, "c"));

            String[] blocks = writer.write(cues).split("\r\n\r\n");

            assertThat(Arrays.stream(blocks).map(b -> b.split("\r\n")[0])).containsExactly("1", "2", "3");
        }

        @Test
        void keepsMultiLineTextUsingCrlf() {
            List<Cue> cues = List.of(new Cue(0, 1_000, "- Who's there?\n- Me."));

            assertThat(writer.write(cues)).isEqualTo("1\r\n00:00:00,000 --> 00:00:01,000\r\n- Who's there?\r\n- Me.\r\n\r\n");
        }

        @Test
        void writesEmptyStringForNoCues() {
            assertThat(writer.write(List.of())).isEmpty();
        }
    }

    @Nested
    class Bytes {

        private final List<Cue> cues = List.of(new Cue(0, 1_000, "café – naïve"));

        @Test
        void encodesUtf8WithoutBomByDefault() {
            byte[] bytes = writer.toBytes(cues, false);

            assertThat(bytes[0]).isEqualTo((byte) '1');
            assertThat(new String(bytes, StandardCharsets.UTF_8)).contains("café – naïve");
        }

        @Test
        void prependsUtf8BomWhenRequested() {
            byte[] bytes = writer.toBytes(cues, true);

            assertThat(Arrays.copyOf(bytes, 3)).containsExactly(0xEF, 0xBB, 0xBF);
            assertThat(new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8))
                    .isEqualTo(writer.write(cues));
        }
    }

    @Nested
    class FileName {

        @Test
        void combinesTitleAndVideoId() {
            assertThat(writer.fileName("Spring Boot Tutorial", ID)).isEqualTo("Spring Boot Tutorial_dQw4w9WgXcQ.en.srt");
        }

        @Test
        void removesCharactersIllegalOnWindows() {
            assertThat(writer.fileName("a\\b/c:d*e?f\"g<h>i|j", ID)).isEqualTo("abcdefghij_dQw4w9WgXcQ.en.srt");
        }

        @Test
        void removesControlCharactersAndCollapsesWhitespace() {
            assertThat(writer.fileName("line one\nline\ttwo   three", ID))
                    .isEqualTo("line one line two three_dQw4w9WgXcQ.en.srt");
        }

        @Test
        void keepsVietnameseAndOtherUnicode() {
            assertThat(writer.fileName("Học Spring Boot – Phần 1 🚀", ID))
                    .isEqualTo("Học Spring Boot – Phần 1 🚀_dQw4w9WgXcQ.en.srt");
        }

        @Test
        void truncatesTitleTo80Characters() {
            String name = writer.fileName("x".repeat(200), ID);

            assertThat(name).isEqualTo("x".repeat(80) + "_dQw4w9WgXcQ.en.srt");
        }

        @Test
        void truncatesByCodePointWithoutSplittingEmoji() {
            String title = "x".repeat(79) + "🚀🚀";

            assertThat(writer.fileName(title, ID)).isEqualTo("x".repeat(79) + "🚀_dQw4w9WgXcQ.en.srt");
        }

        @Test
        void trimsTrailingDotsAndSpaces() {
            assertThat(writer.fileName("  Ends with dots... ", ID)).isEqualTo("Ends with dots_dQw4w9WgXcQ.en.srt");
        }

        @Test
        void fallsBackToIdOnlyWhenTitleIsBlankAfterSanitizing() {
            assertThat(writer.fileName("???", ID)).isEqualTo("dQw4w9WgXcQ.en.srt");
            assertThat(writer.fileName(null, ID)).isEqualTo("dQw4w9WgXcQ.en.srt");
            assertThat(writer.fileName("   ", ID)).isEqualTo("dQw4w9WgXcQ.en.srt");
        }
    }
}
