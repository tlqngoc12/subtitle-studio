package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.translate.ExampleSelector.Candidate;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class ExampleSelectorTest {

    private static Candidate c(String en, String vi, boolean corrected) {
        return new Candidate(en, vi, corrected);
    }

    private static List<String> ens(ExampleSelector.Result result) {
        return result.pairs().stream().map(ExamplePair::en).toList();
    }

    @Test
    void skipsEmptyAndSymbolOnlyLines() {
        var result = ExampleSelector.select(List.of(List.of(
                c("", "x", false), c("Hello", " ", false), c("♪", "♪", false), c("...", "...", false),
                c("Good morning", "Chào buổi sáng", false))));

        assertThat(ens(result)).containsExactly("Good morning");
    }

    @Test
    void skipsDuplicateEnglishLines() {
        var result = ExampleSelector.select(List.of(
                List.of(c("Thank you", "Cảm ơn", false)),
                List.of(c("thank you ", "Cảm ơn nhé", false))));

        assertThat(result.pairs()).hasSize(1);
    }

    @Test
    void handCorrectedLinesComeFirstWhenOverTheLimit() {
        List<Candidate> lines = IntStream.range(0, 100)
                .mapToObj(i -> c("plain line number " + i, "dòng " + i, i >= 90)).toList();

        var result = ExampleSelector.select(List.of(lines));

        assertThat(result.pairs()).hasSize(ExampleSelector.MAX_PAIRS).hasSize(60);
        assertThat(result.corrected()).isEqualTo(10);
        assertThat(ens(result)).contains("plain line number 90", "plain line number 99");
    }

    @Test
    void namesAndAddressTermsComeBeforeLongPlainLines() {
        List<Candidate> lines = new java.util.ArrayList<>();
        for (int i = 0; i < 70; i++) {
            lines.add(c("a very long plain sentence without names, number " + i, "một câu dài " + i, false));
        }
        lines.add(c("Did you see Mon today?", "Em thấy Mon hôm nay không?", false)); // name + pronoun
        lines.add(c("i told her so", "Chị đã nói rồi", false)); // pronoun only

        var result = ExampleSelector.select(List.of(lines));

        assertThat(ens(result)).contains("Did you see Mon today?", "i told her so");
    }

    @Test
    void capitalWordAtTheStartOfASentenceIsNotAName() {
        assertThat(ExampleSelector.isNotable("Hello there. Fine.", "Xin chào")).isFalse();
        assertThat(ExampleSelector.isNotable("I'm tired", "Mệt quá")).isFalse();
        assertThat(ExampleSelector.isNotable("Where is Mon?", "Mon đâu")).isTrue();
        assertThat(ExampleSelector.isNotable("okay", "Chị ơi")).isTrue();
        assertThat(ExampleSelector.isNotable("okay", "Gọi P'Mon đi")).isTrue();
        assertThat(ExampleSelector.isNotable("okay", "Bạn em đâu")).isTrue();
        assertThat(ExampleSelector.isNotable("okay", "Đem về đi")).isFalse(); // "em" inside a word
    }

    @Test
    void longestPlainLinesFillTheRest() {
        var result = ExampleSelector.select(List.of(List.of(
                c("short one", "ngắn", false),
                c("this is a much longer plain line to keep", "một dòng dài hơn nhiều", false))));

        assertThat(ens(result)).containsExactly("short one", "this is a much longer plain line to keep");
        ExampleSelector.Result tight = ExampleSelector.select(List.of(List.of(
                c("short one", "ngắn", false),
                c("this is a much longer plain line to keep", "một dòng dài hơn nhiều", false))), 1, 6000);
        assertThat(ens(tight)).containsExactly("this is a much longer plain line to keep");
    }

    @Test
    void staysWithin6000Characters() {
        List<Candidate> lines = IntStream.range(0, 40)
                .mapToObj(i -> c(("english " + i + " ").repeat(15), ("tiếng việt " + i + " ").repeat(15), true)).toList();

        var result = ExampleSelector.select(List.of(lines));

        int chars = result.pairs().stream().mapToInt(p -> p.en().length() + p.vi().length()).sum();
        assertThat(chars).isLessThanOrEqualTo(ExampleSelector.MAX_CHARS).isLessThanOrEqualTo(6000);
        assertThat(result.pairs()).isNotEmpty().hasSizeLessThan(40);
    }

    @Test
    void keepsVideoThenTimelineOrderAndCountsVideos() {
        var result = ExampleSelector.select(List.of(
                List.of(c("first video a", "a1", false), c("first video b", "b1", false)),
                List.of(),
                List.of(c("third video a", "a3", false))));

        assertThat(ens(result)).containsExactly("first video a", "first video b", "third video a");
        assertThat(result.videos()).isEqualTo(2);
    }
}
