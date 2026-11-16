package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.FakeGeminiServer;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.translate.TranslationFailedException;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** The completeness checks of {@link GeminiTextChapterTranslator} seen through {@link TextChapterTranslation}. */
class TextChapterTranslationCompletenessTest {

    private final FakeGeminiServer server = new FakeGeminiServer();

    @AfterEach
    void stop() {
        server.close();
    }

    private TextChapterTranslation translation() {
        var gemini = new SubtitleStudioProperties.Gemini("k", "gemini-test-flash", Duration.ofSeconds(10),
                Duration.ofMinutes(60), 0.3, List.of());
        var translator = new GeminiTextChapterTranslator(new GeminiCaller(gemini, server.baseUrl()), gemini,
                new ObjectMapper());
        return new TextChapterTranslation(translator, 60_000);
    }

    private static String para(char c, int length) {
        return String.valueOf(c).repeat(length - 1) + ".";
    }

    private static String json(String text) {
        return "{\"text\":\"" + text.replace("\n", "\\n") + "\"}";
    }

    /** Four paragraphs of 300 chars. */
    private static String source() {
        return String.join("\n\n", para('a', 300), para('b', 300), para('c', 300), para('d', 300));
    }

    private static TextChapterPrompt prompt(String source) {
        return new TextChapterPrompt("Warm", 3, null, "profile", null, "en", null, null, source);
    }

    @Test
    void aShortFirstAnswerIsSplitAndOnlyTheShortPieceIsSplitAgain() {
        String shortAnswer = String.join("\n\n", para('x', 100), para('x', 100), para('x', 100), para('x', 100));
        String half = String.join("\n\n", para('y', 300), para('y', 300));
        server.queueText(json(shortAnswer));       // whole chapter: 406 of 1,206 chars, rejected
        server.queueText(json(half));              // first half: complete
        server.queueText(json(para('z', 100) + "\n\n" + para('z', 100))); // second half: 202 of 602, rejected
        server.queueText(json(para('p', 300)));    // its first paragraph
        server.queueText(json(para('q', 300)));    // its second paragraph

        TextChapterTranslation.Result r = translation().translate(prompt(source()), m -> {});

        assertThat(server.requests()).isEqualTo(5);
        assertThat(r.requests()).isEqualTo(5);
        assertThat(r.text()).isEqualTo(String.join("\n\n", half, para('p', 300), para('q', 300)));
    }

    @Test
    void everyPieceShortEndsFailedAndNothingIsReturned() {
        server.replyText(json(String.join("\n\n", para('x', 50), para('x', 50))), "STOP");

        assertThatThrownBy(() -> translation().translate(prompt(source()), m -> {}))
                .isInstanceOf(TranslationFailedException.class);
        assertThat(server.requests()).isGreaterThan(1);
    }
}
