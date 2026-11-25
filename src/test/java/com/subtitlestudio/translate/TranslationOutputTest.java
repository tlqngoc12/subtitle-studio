package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class TranslationOutputTest {

    private static final List<SourceLine> SENT = List.of(
            new SourceLine(0, "Hello"),
            new SourceLine(1, "- Are you hungry?\n- A little."),
            new SourceLine(2, "Bye"));

    @Test
    void acceptsExactIdsInSentOrder() {
        List<TranslatedLine> got = List.of(
                new TranslatedLine(2, "Tạm biệt"),
                new TranslatedLine(0, "Xin chào"),
                new TranslatedLine(1, "- Đói chưa?\n- Hơi hơi."));

        assertThat(TranslationOutput.validate(SENT, got)).extracting(TranslatedLine::id).containsExactly(0, 1, 2);
    }

    @Test
    void keepsDialogueDashesAndNewlines() {
        List<TranslatedLine> got = List.of(
                new TranslatedLine(0, "Xin chào"),
                new TranslatedLine(1, "- Đói chưa?\n- Hơi hơi."),
                new TranslatedLine(2, "Tạm biệt"));

        assertThat(TranslationOutput.validate(SENT, got).get(1).text()).isEqualTo("- Đói chưa?\n- Hơi hơi.");
    }

    @Test
    void normalisesLineBreaksAndSpaces() {
        List<TranslatedLine> got = List.of(
                new TranslatedLine(0, "  Xin chào\r\n- Chào  "),
                new TranslatedLine(1, "a\rb"),
                new TranslatedLine(2, "c"));

        List<TranslatedLine> out = TranslationOutput.validate(SENT, got);

        assertThat(out.get(0).text()).isEqualTo("Xin chào\n- Chào");
        assertThat(out.get(1).text()).isEqualTo("a\nb");
    }

    @Test
    void describesWhatIsWrongWithoutSubtitleText() {
        List<TranslatedLine> got = List.of(
                new TranslatedLine(0, "Xin chào"),
                new TranslatedLine(0, "Xin chào lần nữa"),
                new TranslatedLine(2, "  "),
                new TranslatedLine(7, "thừa"));

        String summary = TranslationOutput.describe(SENT, got);

        assertThat(summary).isEqualTo("items=4 valid=0/3 missing=1 extra=1 duplicated=1 blank=1 missingIds=[1]");
        assertThat(summary).doesNotContain("Xin chào").doesNotContain("Hello");
    }

    @Test
    void listsAtMostTenMissingIds() {
        List<SourceLine> many = java.util.stream.IntStream.range(0, 15).mapToObj(i -> new SourceLine(i, "l" + i)).toList();

        assertThat(TranslationOutput.describe(many, List.of()))
                .isEqualTo("items=0 valid=0/15 missing=15 extra=0 duplicated=0 blank=0 missingIds=[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, …]");
    }

    @Test
    void rejectsMissingId() {
        List<TranslatedLine> got = List.of(new TranslatedLine(0, "a"), new TranslatedLine(1, "b"));

        assertThatThrownBy(() -> TranslationOutput.validate(SENT, got))
                .isInstanceOf(TranslationFailedException.class)
                .extracting(e -> ((TranslationFailedException) e).userMessage())
                .isEqualTo("Gemini returned missing or mismatched lines (2/3 valid), try again.");
    }

    @Test
    void dropsExtraId() {
        List<TranslatedLine> got = List.of(new TranslatedLine(0, "a"), new TranslatedLine(1, "b"),
                new TranslatedLine(2, "c"), new TranslatedLine(9, "x"));

        assertThat(TranslationOutput.validate(SENT, got)).extracting(TranslatedLine::id).containsExactly(0, 1, 2);
    }

    @Test
    void checkKeepsValidLinesAndListsMissingTail() {
        TranslationOutput.Checked checked = TranslationOutput.check(SENT,
                List.of(new TranslatedLine(1, " b "), new TranslatedLine(0, "a")));

        assertThat(checked.valid()).containsExactly(new TranslatedLine(0, "a"), new TranslatedLine(1, "b"));
        assertThat(checked.missing()).containsExactly(SENT.get(2));
        assertThat(checked.extra()).isZero();
    }

    @Test
    void checkPutsDuplicateAndBlankIntoMissingAndCountsExtra() {
        TranslationOutput.Checked checked = TranslationOutput.check(SENT, List.of(
                new TranslatedLine(0, "a"), new TranslatedLine(0, "a2"),
                new TranslatedLine(1, "  "), new TranslatedLine(2, "c"),
                new TranslatedLine(7, "x"), new TranslatedLine(7, "y"), new TranslatedLine(8, "z")));

        assertThat(checked.valid()).containsExactly(new TranslatedLine(2, "c"));
        assertThat(checked.missing()).containsExactly(SENT.get(0), SENT.get(1));
        assertThat(checked.extra()).isEqualTo(2);
    }

    @Test
    void rejectsDuplicateId() {
        List<TranslatedLine> got = List.of(new TranslatedLine(0, "a"), new TranslatedLine(0, "a2"),
                new TranslatedLine(1, "b"), new TranslatedLine(2, "c"));

        assertThatThrownBy(() -> TranslationOutput.validate(SENT, got))
                .extracting(e -> ((TranslationFailedException) e).userMessage())
                .isEqualTo("Gemini returned missing or mismatched lines (2/3 valid), try again.");
    }

    @Test
    void rejectsBlankText() {
        List<TranslatedLine> got = List.of(new TranslatedLine(0, "a"), new TranslatedLine(1, "  "),
                new TranslatedLine(2, null));

        assertThatThrownBy(() -> TranslationOutput.validate(SENT, got))
                .extracting(e -> ((TranslationFailedException) e).userMessage())
                .isEqualTo("Gemini returned missing or mismatched lines (1/3 valid), try again.");
    }

    // ---- echo check ----

    private static List<SourceLine> sources(int count) {
        return java.util.stream.IntStream.range(0, count)
                .mapToObj(i -> new SourceLine(i, "alpha" + i + " beta" + i + " gamma"))
                .toList();
    }

    private static AnswerLine own(int id) {
        return new AnswerLine(id, "alpha" + id + " beta" + id, "dòng " + id);
    }

    /** Line {@code id} carrying the echo of source {@code of}. */
    private static AnswerLine carrying(int id, int of) {
        return new AnswerLine(id, "alpha" + of + " beta" + of, "dòng " + of);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource(delimiter = '|', value = {
            "We probably|We probably can't be…|true",
            "we, PROBABLY|We probably…|true",
            "They're similar|They're similar to me…|true",
            "Next is|Kee is someone…|false",
            "...|...|true",
            "hmm|hmm...|true",
            "Love|Love of Siam|true"})
    void echoMatchesFirstWordsIgnoringCaseAndPunctuation(String echo, String source, boolean expected) {
        assertThat(TranslationOutput.echoMatches(echo, source)).isEqualTo(expected);
    }

    @Test
    void aSingleBadEchoOnlyMakesThatLineMissing() {
        List<SourceLine> sent = sources(10);
        List<AnswerLine> got = new java.util.ArrayList<>();
        for (int i = 0; i < 10; i++) {
            got.add(i == 3 ? carrying(3, 7) : own(i));
        }

        TranslationOutput.Checked checked = TranslationOutput.checkAnswer(sent, got);

        assertThat(checked.missing()).extracting(SourceLine::id).containsExactly(3);
        assertThat(checked.valid()).hasSize(9);
    }

    @Test
    void aSlideMakesTheStartOfTheRunAndEverythingAfterItMissing() {
        List<SourceLine> sent = sources(10);
        List<AnswerLine> got = new java.util.ArrayList<>();
        for (int i = 0; i < 4; i++) {
            got.add(own(i));
        }
        for (int i = 4; i < 9; i++) {
            got.add(carrying(i, i + 1));
        }

        TranslationOutput.Checked checked = TranslationOutput.checkAnswer(sent, got);

        assertThat(checked.missing()).extracting(SourceLine::id).containsExactly(4, 5, 6, 7, 8, 9);
        assertThat(checked.valid()).extracting(TranslatedLine::id).containsExactly(0, 1, 2, 3);
    }

    @Test
    void aChanceMatchInsideASlideIsNotTrusted() {
        List<SourceLine> sent = sources(10);
        List<AnswerLine> got = new java.util.ArrayList<>();
        for (int i = 0; i < 10; i++) {
            got.add(i == 6 ? own(6) : carrying(i, (i + 1) % 10));
        }

        assertThat(TranslationOutput.checkAnswer(sent, got).missing()).hasSize(10);
    }

    @Test
    void twoBadEchoesInARowAreNotASlide() {
        List<SourceLine> sent = sources(10);
        List<AnswerLine> got = new java.util.ArrayList<>();
        for (int i = 0; i < 10; i++) {
            got.add(i == 3 || i == 4 ? carrying(i, 9) : own(i));
        }

        assertThat(TranslationOutput.checkAnswer(sent, got).missing()).extracting(SourceLine::id).containsExactly(3, 4);
    }

    @Test
    void anAnswerWithoutSrcIsNotEchoChecked() {
        List<SourceLine> sent = sources(10);
        List<AnswerLine> got = new java.util.ArrayList<>();
        for (int i = 0; i < 10; i++) {
            got.add(new AnswerLine(i, i % 2 == 0 ? null : "  ", "dòng " + i));
        }

        TranslationOutput.Checked checked = TranslationOutput.checkAnswer(sent, got);

        assertThat(checked.missing()).isEmpty();
        assertThat(checked.valid()).hasSize(10);
    }

    @Test
    void describeCountsEchoMismatchesWithoutSubtitleText() {
        List<SourceLine> sent = sources(10);
        List<AnswerLine> got = new java.util.ArrayList<>();
        for (int i = 0; i < 4; i++) {
            got.add(own(i));
        }
        for (int i = 4; i < 9; i++) {
            got.add(carrying(i, i + 1));
        }

        String summary = TranslationOutput.describeAnswer(sent, got);

        assertThat(summary).contains("echoMismatch=5 noEcho=0 firstMismatchId=4");
        assertThat(summary).doesNotContain("alpha").doesNotContain("beta").doesNotContain("gamma").doesNotContain("dòng");
    }

    @Test
    void describeShowsNoMismatchAsADash() {
        String summary = TranslationOutput.describeAnswer(sources(3), List.of(own(0), own(1), new AnswerLine(2, null, "x")));

        assertThat(summary).endsWith("echoMismatch=0 noEcho=1 firstMismatchId=-");
    }
}
