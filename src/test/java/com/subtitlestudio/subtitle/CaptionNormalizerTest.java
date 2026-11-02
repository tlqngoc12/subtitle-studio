package com.subtitlestudio.subtitle;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class CaptionNormalizerTest {

    private final CaptionNormalizer normalizer = new CaptionNormalizer();

    @Nested
    class Auto {

        private final List<RawCue> rolling = new VttParser().parse(fixture("vtt/auto-rolling.vtt"));

        @Test
        void collapsesRollingDuplicatesIntoOneSegmentPerLine() {
            List<Cue> cues = normalizer.normalize(rolling, SourceType.AUTO, false);

            assertThat(cues).containsExactly(
                    new Cue(1_000, 3_510, "so today we're going to talk"),
                    new Cue(3_510, 6_010, "about dependency injection in spring"),
                    new Cue(6_010, 8_500, "and why it matters"));
        }

        @Test
        void mergesShortLinesByDefaultWithinLengthAndDurationLimits() {
            List<Cue> cues = normalizer.normalize(rolling, SourceType.AUTO);

            // Adding the third line would make the cue 7.5s long (> 7s), so it stays separate.
            assertThat(cues).containsExactly(
                    new Cue(1_000, 6_010, "so today we're going to talk about dependency injection in spring"),
                    new Cue(6_010, 8_500, "and why it matters"));
        }

        @Test
        void neverRepeatsTheSameTextInConsecutiveCues() {
            List<Cue> cues = normalizer.normalize(rolling, SourceType.AUTO, false);

            for (int i = 1; i < cues.size(); i++) {
                assertThat(cues.get(i).text()).isNotEqualTo(cues.get(i - 1).text());
            }
        }

        @Test
        void dropsCuesShorterThan50ms() {
            List<RawCue> raw = List.of(
                    raw(1_000, 1_049, "flash"),
                    raw(2_000, 2_050, "kept"));

            assertThat(normalizer.normalize(raw, SourceType.AUTO, false)).extracting(Cue::text)
                    .containsExactly("kept");
        }

        @Test
        void keepsGapWhenLineDisappearsBeforeNextLineStarts() {
            List<RawCue> raw = List.of(
                    raw(1_000, 3_000, "before the music"),
                    raw(30_000, 32_000, "after the music"));

            assertThat(normalizer.normalize(raw, SourceType.AUTO, false)).containsExactly(
                    new Cue(1_000, 3_000, "before the music"),
                    new Cue(30_000, 32_000, "after the music"));
        }

        @Test
        void skipsLinesAlreadyShownInPreviousCueEvenWhenNotTheLastEmitted() {
            List<RawCue> raw = List.of(
                    raw(1_000, 3_000, "line a", "line b"),
                    raw(3_000, 5_000, "line a", "line b"),
                    raw(5_000, 7_000, "line b", "line c"));

            assertThat(normalizer.normalize(raw, SourceType.AUTO, false)).containsExactly(
                    new Cue(1_000, 5_000, "line a line b"),
                    new Cue(5_000, 7_000, "line c"));
        }

        @Test
        void combinesSeveralNewLinesFromTheSameCue() {
            List<RawCue> raw = List.of(raw(1_000, 4_000, "first new line", "second new line"));

            assertThat(normalizer.normalize(raw, SourceType.AUTO, false))
                    .containsExactly(new Cue(1_000, 4_000, "first new line second new line"));
        }

        @Test
        void trimsAndCollapsesWhitespaceBeforeComparingLines() {
            List<RawCue> raw = List.of(
                    raw(1_000, 2_000, "  hello    world "),
                    raw(2_000, 3_000, "hello world", "next"));

            assertThat(normalizer.normalize(raw, SourceType.AUTO, false)).containsExactly(
                    new Cue(1_000, 2_000, "hello world"),
                    new Cue(2_000, 3_000, "next"));
        }

        @Test
        void sortsUnorderedInput() {
            List<RawCue> raw = List.of(
                    raw(5_000, 6_000, "second"),
                    raw(1_000, 2_000, "first"));

            assertThat(normalizer.normalize(raw, SourceType.AUTO, false)).extracting(Cue::text)
                    .containsExactly("first", "second");
        }
    }

    @Nested
    class Manual {

        @Test
        void keepsOriginalTimingAndDoesNotMergeByDefault() {
            List<RawCue> raw = List.of(
                    raw(1_000, 2_000, "Hi."),
                    raw(2_100, 3_000, "Hello."));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL)).containsExactly(
                    new Cue(1_000, 2_000, "Hi."),
                    new Cue(2_100, 3_000, "Hello."));
        }

        @Test
        void keepsIntentionallyRepeatedLines() {
            List<RawCue> raw = List.of(
                    raw(1_000, 2_000, "Yeah."),
                    raw(2_000, 3_000, "Yeah."));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL)).extracting(Cue::text)
                    .containsExactly("Yeah.", "Yeah.");
        }

        @Test
        void keepsShortCuesAndMultipleLines() {
            List<RawCue> raw = List.of(raw(1_000, 1_020, "-  Who's there? ", "- Me."));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL))
                    .containsExactly(new Cue(1_000, 1_300, "- Who's there?\n- Me."));
        }

        @Test
        void extendsTooShortCueTo300msWhenThereIsRoom() {
            List<RawCue> raw = List.of(
                    raw(1_000, 1_100, "quick"),
                    raw(5_000, 6_000, "later"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL).get(0))
                    .isEqualTo(new Cue(1_000, 1_300, "quick"));
        }

        @Test
        void minimumDurationNeverOverlapsNextCue() {
            List<RawCue> raw = List.of(
                    raw(1_000, 1_100, "quick"),
                    raw(1_200, 2_000, "next"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL)).containsExactly(
                    new Cue(1_000, 1_200, "quick"),
                    new Cue(1_200, 2_000, "next"));
        }

        @Test
        void clampsOverlappingCueToNextStart() {
            List<RawCue> raw = List.of(
                    raw(1_000, 4_000, "long"),
                    raw(3_000, 5_000, "overlaps"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL).get(0).endMs()).isEqualTo(3_000);
        }

        @Test
        void fixesEndBeforeStart() {
            List<RawCue> raw = List.of(raw(2_000, 1_000, "broken timing"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL))
                    .containsExactly(new Cue(2_000, 2_300, "broken timing"));
        }
    }

    @Nested
    class MergeRule {

        private static final String A41 = "a".repeat(41);
        private static final String A42 = "a".repeat(42);

        @Test
        void mergesWhenCombinedLengthIsExactly84() {
            List<RawCue> raw = List.of(raw(0, 1_000, A41), raw(1_000, 2_000, A42));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL, true))
                    .containsExactly(new Cue(0, 2_000, A41 + " " + A42));
        }

        @Test
        void doesNotMergeWhenCombinedLengthIs85() {
            List<RawCue> raw = List.of(raw(0, 1_000, A42), raw(1_000, 2_000, A42));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL, true)).hasSize(2);
        }

        @Test
        void mergesWhenGapIsJustUnderOneSecond() {
            List<RawCue> raw = List.of(raw(0, 1_000, "one"), raw(1_999, 3_000, "two"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL, true))
                    .containsExactly(new Cue(0, 3_000, "one two"));
        }

        @Test
        void doesNotMergeWhenGapIsOneSecond() {
            List<RawCue> raw = List.of(raw(0, 1_000, "one"), raw(2_000, 3_000, "two"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL, true)).hasSize(2);
        }

        @Test
        void mergesWhenTotalDurationIsExactly7s() {
            List<RawCue> raw = List.of(raw(0, 3_000, "one"), raw(3_000, 7_000, "two"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL, true)).hasSize(1);
        }

        @Test
        void doesNotMergeWhenTotalDurationExceeds7s() {
            List<RawCue> raw = List.of(raw(0, 3_000, "one"), raw(3_000, 7_001, "two"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL, true)).hasSize(2);
        }

        @Test
        void mergesGreedilyAcrossSeveralSegments() {
            List<RawCue> raw = List.of(
                    raw(0, 1_000, "one"),
                    raw(1_000, 2_000, "two"),
                    raw(2_000, 3_000, "three"),
                    raw(9_000, 10_000, "far away"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL, true)).containsExactly(
                    new Cue(0, 3_000, "one two three"),
                    new Cue(9_000, 10_000, "far away"));
        }

        @Test
        void joinsManualMultiLineTextWithSpaceWhenMerging() {
            List<RawCue> raw = List.of(raw(0, 1_000, "line a", "line b"), raw(1_000, 2_000, "line c"));

            assertThat(normalizer.normalize(raw, SourceType.MANUAL, true))
                    .containsExactly(new Cue(0, 2_000, "line a line b line c"));
        }
    }

    @Test
    void returnsEmptyListForEmptyInput() {
        assertThat(normalizer.normalize(List.of(), SourceType.AUTO)).isEmpty();
        assertThat(normalizer.normalize(List.of(), SourceType.MANUAL)).isEmpty();
    }

    @Test
    void outputNeverOverlapsAndEveryCueHasPositiveDuration() {
        List<RawCue> rolling = new VttParser().parse(fixture("vtt/auto-rolling.vtt"));

        for (SourceType type : SourceType.values()) {
            List<Cue> cues = normalizer.normalize(rolling, type);
            for (int i = 0; i < cues.size(); i++) {
                assertThat(cues.get(i).endMs()).isGreaterThan(cues.get(i).startMs());
                if (i > 0) {
                    assertThat(cues.get(i).startMs()).isGreaterThanOrEqualTo(cues.get(i - 1).endMs());
                }
            }
        }
    }

    private static RawCue raw(long start, long end, String... lines) {
        return new RawCue(start, end, List.of(lines));
    }

    private static String fixture(String path) {
        try (InputStream in = CaptionNormalizerTest.class.getClassLoader().getResourceAsStream(path)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
