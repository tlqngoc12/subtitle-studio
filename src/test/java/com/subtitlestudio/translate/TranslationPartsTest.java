package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class TranslationPartsTest {

    private static final long MINUTE = 60_000;
    private static final long PART = 45 * MINUTE;

    /** One cue per minute. */
    private static List<Long> everyMinute(int minutes) {
        List<Long> starts = new ArrayList<>();
        for (int i = 0; i < minutes; i++) {
            starts.add(i * MINUTE);
        }
        return starts;
    }

    @Test
    void aVideoWithinThePartDurationIsOnePart() {
        List<TranslationParts.Range> parts = TranslationParts.split(everyMinute(40), PART);

        assertThat(parts).containsExactly(new TranslationParts.Range(0, 40));
    }

    @Test
    void aHundredMinutesMakesThreePartsStartingOnCues() {
        List<TranslationParts.Range> parts = TranslationParts.split(everyMinute(100), PART);

        assertThat(parts).containsExactly(
                new TranslationParts.Range(0, 45),
                new TranslationParts.Range(45, 90),
                new TranslationParts.Range(90, 100));
    }

    @Test
    void aSingleVeryLongCueIsOnePart() {
        assertThat(TranslationParts.split(List.of(0L), PART)).containsExactly(new TranslationParts.Range(0, 1));
    }

    @Test
    void aLongSilenceNeverMakesAnEmptyPart() {
        // 3 cues, then nothing for 3 hours, then 2 cues.
        List<Long> starts = List.of(0L, MINUTE, 2 * MINUTE, 180 * MINUTE, 181 * MINUTE);

        List<TranslationParts.Range> parts = TranslationParts.split(starts, PART);

        assertThat(parts).containsExactly(new TranslationParts.Range(0, 3), new TranslationParts.Range(3, 5));
    }

    @Test
    void noCuesMakeNoParts() {
        assertThat(TranslationParts.split(List.of(), PART)).isEmpty();
    }
}
