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
    void rejectsMissingId() {
        List<TranslatedLine> got = List.of(new TranslatedLine(0, "a"), new TranslatedLine(1, "b"));

        assertThatThrownBy(() -> TranslationOutput.validate(SENT, got))
                .isInstanceOf(TranslationFailedException.class)
                .extracting(e -> ((TranslationFailedException) e).userMessage())
                .isEqualTo("Gemini trả về thiếu/lệch câu (2/3 câu hợp lệ), thử dịch lại.");
    }

    @Test
    void rejectsExtraId() {
        List<TranslatedLine> got = List.of(new TranslatedLine(0, "a"), new TranslatedLine(1, "b"),
                new TranslatedLine(2, "c"), new TranslatedLine(9, "x"));

        assertThatThrownBy(() -> TranslationOutput.validate(SENT, got))
                .extracting(e -> ((TranslationFailedException) e).userMessage())
                .isEqualTo("Gemini trả về thiếu/lệch câu (3/3 câu hợp lệ), thử dịch lại.");
    }

    @Test
    void rejectsDuplicateId() {
        List<TranslatedLine> got = List.of(new TranslatedLine(0, "a"), new TranslatedLine(0, "a2"),
                new TranslatedLine(1, "b"), new TranslatedLine(2, "c"));

        assertThatThrownBy(() -> TranslationOutput.validate(SENT, got))
                .extracting(e -> ((TranslationFailedException) e).userMessage())
                .isEqualTo("Gemini trả về thiếu/lệch câu (2/3 câu hợp lệ), thử dịch lại.");
    }

    @Test
    void rejectsBlankText() {
        List<TranslatedLine> got = List.of(new TranslatedLine(0, "a"), new TranslatedLine(1, "  "),
                new TranslatedLine(2, null));

        assertThatThrownBy(() -> TranslationOutput.validate(SENT, got))
                .extracting(e -> ((TranslationFailedException) e).userMessage())
                .isEqualTo("Gemini trả về thiếu/lệch câu (1/3 câu hợp lệ), thử dịch lại.");
    }
}
