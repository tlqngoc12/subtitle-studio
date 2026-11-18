package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.FakeGeminiServer;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.translate.TranslationFailedException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

@org.junit.jupiter.api.extension.ExtendWith(org.springframework.boot.test.system.OutputCaptureExtension.class)
class GeminiTextChapterTranslatorTest {

    private static final String SOURCE = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
    /** A complete answer for {@link #SOURCE}: 43 chars of 53, ends with a full stop. */
    private static final String GOOD = "Đoạn thứ nhất.\n\nĐoạn thứ hai.\n\nĐoạn thứ ba.";

    private final FakeGeminiServer server = new FakeGeminiServer();

    @AfterEach
    void stop() {
        server.close();
    }

    private GeminiTextChapterTranslator translator(List<String> fallbacks) {
        var gemini = new SubtitleStudioProperties.Gemini("k", "gemini-test-flash", Duration.ofSeconds(10),
                Duration.ofMinutes(60), 0.3, fallbacks);
        return new GeminiTextChapterTranslator(new GeminiCaller(gemini, server.baseUrl()), gemini, new ObjectMapper());
    }

    private GeminiTextChapterTranslator translatorThinking(String level) {
        var gemini = new SubtitleStudioProperties.Gemini("k", "gemini-test-flash", Duration.ofSeconds(10),
                Duration.ofMinutes(60), Duration.ofMinutes(45), 0.3, List.of(), level);
        return new GeminiTextChapterTranslator(new GeminiCaller(gemini, server.baseUrl()), gemini, new ObjectMapper());
    }

    private static TextChapterPrompt prompt(String language, String carrySource, String carryTranslation) {
        return new TextChapterPrompt("Warm", 3, null, "Hồ sơ: dịch mượt", "Chương trước đây",
                language, carrySource, carryTranslation, SOURCE);
    }

    private static String answer(String text) {
        return "{\"text\":\"" + text.replace("\n", "\\n") + "\"}";
    }

    @Test
    void sendsTheWholeChapterInOneRequestWithTheContext() {
        server.replyText(answer(GOOD), "STOP");

        TextAnswer got = translator(List.of()).translate(prompt("en", null, null), m -> {});

        assertThat(server.requests()).isEqualTo(1);
        assertThat(got.text()).isEqualTo(GOOD);
        assertThat(got.model()).isEqualTo("gemini-test-flash");
        String body = server.lastBody();
        assertThat(body).contains("systemInstruction").contains("tiếng Anh").contains("responseSchema");
        assertThat(body).contains("# Hồ sơ dịch").contains("Hồ sơ: dịch mượt");
        assertThat(body).contains("# Chương trước (bản dịch)").contains("Chương trước đây");
        assertThat(body).contains("Chương 3").contains("Warm");
        assertThat(body).contains("First paragraph.").contains("Third paragraph.");
        assertThat(body).doesNotContain("Cuối phần gốc đã dịch");
        assertThat(body).doesNotContain("MEDIA_RESOLUTION");
    }

    @Test
    void aSpanishChapterNamesSpanishAndHasNoThaiRule() {
        server.replyText(answer(GOOD), "STOP");
        translator(List.of()).translate(prompt("es", null, null), m -> {});
        String body = server.lastBody();

        assertThat(body).contains("tiếng Tây Ban Nha").doesNotContain("Không để sót chữ Thái")
                .doesNotContain("tiếng Thái").doesNotContain("tiếng Anh");
    }

    @Test
    void thaiRulesAreOnlySentForThai() {
        server.replyText(answer(GOOD), "STOP");
        translator(List.of()).translate(prompt("th", null, null), m -> {});
        String thai = server.lastBody();
        server.replyText(answer(GOOD), "STOP");
        translator(List.of()).translate(prompt("en", null, null), m -> {});
        String english = server.lastBody();

        assertThat(thai).contains("tiếng Thái").contains("Không để sót chữ Thái");
        assertThat(english).contains("tiếng Anh").doesNotContain("Không để sót chữ Thái").doesNotContain("tiếng Thái");
    }

    @Test
    void laterPartsCarryTheEndOfThePreviousPart() {
        server.replyText(answer(GOOD), "STOP");

        translator(List.of()).translate(prompt("en", "the old source end", "đoạn dịch cũ"), m -> {});

        assertThat(server.lastBody()).contains("# Đoạn ngay trước (để giữ mạch, KHÔNG dịch lại)")
                .contains("the old source end").contains("đoạn dịch cũ");
    }

    @Test
    void reportsEachModelItTries() {
        server.replyForModel("gemini-test-flash", 503, "{\"error\":{\"code\":503,\"message\":\"busy\"}}");
        server.replyText(answer(GOOD), "STOP");
        List<String> tried = new ArrayList<>();

        TextAnswer got = translator(List.of("gemini-fallback")).translate(prompt("en", null, null), tried::add);

        assertThat(tried).containsExactly("gemini-test-flash", "gemini-fallback");
        assertThat(got.model()).isEqualTo("gemini-fallback");
    }

    @Test
    void maxTokensMeansIncomplete() {
        server.replyText(answer("Một."), "MAX_TOKENS");

        assertThatThrownBy(() -> translator(List.of()).translate(prompt("en", null, null), m -> {}))
                .isInstanceOf(TextIncompleteException.class);
    }

    @Test
    void truncatedJsonMeansIncomplete() {
        server.replyText("{\"text\":\"Một.\\n\\nHai", "STOP");

        assertThatThrownBy(() -> translator(List.of()).translate(prompt("en", null, null), m -> {}))
                .isInstanceOf(TextIncompleteException.class);
    }

    @Test
    void anAnswerWithFarFewerParagraphsMeansIncomplete() {
        String source = String.join("\n\n", java.util.Collections.nCopies(10, "A paragraph."));
        server.replyText(answer(GOOD), "STOP");
        var prompt = new TextChapterPrompt("Warm", 3, null, "p", null, "en", null, null, source);

        assertThatThrownBy(() -> translator(List.of()).translate(prompt, m -> {}))
                .isInstanceOf(TextIncompleteException.class);
    }

    @Test
    void anAnswerAboveTheThresholdIsAccepted() {
        String source = String.join("\n\n", java.util.Collections.nCopies(10, "A paragraph."));
        server.replyText(answer("Đoạn một của chương này khá dài.\n\nĐoạn hai của chương này khá dài.\n\n"
                + "Đoạn ba của chương này khá dài.\n\nĐoạn bốn của chương này khá dài."), "STOP");
        var prompt = new TextChapterPrompt("Warm", 3, null, "p", null, "en", null, null, source);

        assertThat(translator(List.of()).translate(prompt, m -> {}).text()).startsWith("Đoạn một");
    }

    private static TextChapterPrompt promptFor(String source) {
        return new TextChapterPrompt("Warm", 3, null, "p", null, "en", null, null, source);
    }

    /** A source of one paragraph with exactly {@code length} chars, ending with {@code ending}. */
    private static String sourceOf(int length, String ending) {
        return "a".repeat(length - ending.length()) + ending;
    }

    private static String answerOf(int length, String ending) {
        return "b".repeat(length - ending.length()) + ending;
    }

    @Test
    void anAnswerJustUnderTheLengthRatioIsRejectedAndJustAtItAccepted() {
        String source = sourceOf(1000, ".");
        server.replyText(answer(answerOf(699, ".")), "STOP");
        assertThatThrownBy(() -> translator(List.of()).translate(promptFor(source), m -> {}))
                .isInstanceOf(TextIncompleteException.class).hasMessageContaining("shorter");

        server.replyText(answer(answerOf(700, ".")), "STOP");
        assertThat(translator(List.of()).translate(promptFor(source), m -> {}).text()).hasSize(700);
    }

    @Test
    void anAnswerThatStopsMidSentenceIsRejectedAfterAFullStopOrAQuote() {
        for (String ending : List.of(".", "\"")) {
            server.replyText(answer(answerOf(1000, "của")), "STOP");
            assertThatThrownBy(() -> translator(List.of()).translate(promptFor(sourceOf(1000, ending)), m -> {}))
                    .isInstanceOf(TextIncompleteException.class).hasMessageContaining("mid-sentence");
        }
    }

    @Test
    void theCutEndingCheckIsSkippedWhenTheSourceEndsWithASceneBreakOrNoPunctuation() {
        server.replyText(answer(answerOf(1000, "của")), "STOP");
        assertThat(translator(List.of()).translate(promptFor(sourceOf(1000, "\n\n***")), m -> {}).text())
                .endsWith("của");
        server.replyText(answer(answerOf(1000, "của")), "STOP");
        assertThat(translator(List.of()).translate(promptFor(sourceOf(1000, "~")), m -> {}).text()).endsWith("của");
        server.replyText(answer(answerOf(1000, "của")), "STOP");
        assertThat(translator(List.of()).translate(promptFor(sourceOf(1000, "Bye")), m -> {}).text())
                .endsWith("của");
    }

    @Test
    void endsMidSentenceLooksOnlyAtTheLastParagraphIgnoringTrailingSpaces() {
        assertThat(GeminiTextChapterTranslator.endsMidSentence("One.\n\nTwo!  ", "Một.\n\nHai của")).isTrue();
        assertThat(GeminiTextChapterTranslator.endsMidSentence("One.\n\nTwo!  ", "Một.\n\nHai!  ")).isFalse();
        assertThat(GeminiTextChapterTranslator.endsMidSentence("One.\n\n***", "Một.\n\nHai của")).isFalse();
        assertThat(GeminiTextChapterTranslator.endsMidSentence("Say “hi”", "Nói “xin chào")).isTrue();
    }

    @Test
    void theChapterNineteenShapeIsRejected() {
        // 13,675 source chars in 100 paragraphs came back as 6,550 chars in 50 paragraphs: enough paragraphs for the
        // 40 % rule, far too little text
        String source = String.join("\n\n", java.util.Collections.nCopies(100, "a".repeat(134) + "."));
        String shortAnswer = String.join("\n\n", java.util.Collections.nCopies(50, "b".repeat(129) + "."));
        assertThat((double) shortAnswer.length() / source.length()).isBetween(0.47, 0.49);
        server.replyText(answer(shortAnswer), "STOP");

        assertThatThrownBy(() -> translator(List.of()).translate(promptFor(source), m -> {}))
                .isInstanceOf(TextIncompleteException.class).hasMessageContaining("shorter");
    }

    @Test
    void theLogNamesTheCheckAndTheLengthsButNeverTheText(org.springframework.boot.test.system.CapturedOutput out) {
        server.replyText(answer(answerOf(300, "SECRETTAIL")), "STOP");

        assertThatThrownBy(() -> translator(List.of()).translate(promptFor(sourceOf(1000, ".")), m -> {}))
                .isInstanceOf(TextIncompleteException.class);

        assertThat(out.getAll()).contains("1000").contains("300").doesNotContain("SECRETTAIL").doesNotContain("aaaaa")
                .doesNotContain("bbbbb");
    }

    // ---- images ----

    private static final String NL = "\n\n";

    private static TextChapterPrompt withMarkers(String source) {
        return new TextChapterPrompt("Warm", 3, null, "p", null, "en", null, null, source);
    }

    private static String readGolden(String name) throws java.io.IOException {
        return java.nio.file.Files.readString(java.nio.file.Path.of("src/test/resources/novel", name),
                java.nio.charset.StandardCharsets.UTF_8);
    }

    @Test
    void textOnlyRequestIsUnchanged() throws Exception {
        for (String language : List.of("en", "th")) {
            server.replyText(answer(GOOD), "STOP");

            translator(List.of()).translate(new TextChapterPrompt("Warm", 3, null, "Hồ sơ: dịch mượt",
                    "Chương trước đây", language, "carry src", "carry tr", SOURCE), m -> {});

            assertThat(server.lastBody()).as(language).isEqualTo(readGolden("text-only-request-" + language + ".json"));
        }
    }

    @Test
    void sendsTextWithoutMarkersOrImages() throws Exception {
        String source = "Before.\n\n[[image:5]]\n\nBetween.\n\n[[image:6]]\n\nAfter.";
        server.replyText(answer("Trước đó.\n\nỞ giữa.\n\nSau đó."), "STOP");

        translator(List.of()).translate(new TextChapterPrompt("Warm", 3, null, "p", null, "en",
                "carry one" + NL + "[[image:5]]" + NL + "carry src",
                "carry two" + NL + "[[image:6]]" + NL + "carry tr", source), m -> {});

        var tree = new ObjectMapper().readTree(server.lastBody());
        var parts = tree.get("contents").get(0).get("parts");
        assertThat(parts).hasSize(2);
        assertThat(parts.get(1).get("text").asText()).isEqualTo("Before.\n\nBetween.\n\nAfter.");
        assertThat(server.lastBody()).doesNotContain("[[image:").doesNotContain("inlineData").doesNotContain("Ảnh ");
        String rules = tree.get("systemInstruction").get("parts").get(0).get("text").asText();
        assertThat(rules).doesNotContain("[[image:N]]").doesNotContain("NGAY SAU");
    }

    @Test
    void translatedTextHasNoMarkersEvenIfGeminiAddsOne() {
        String source = "Before.\n\n[[image:5]]\n\nBetween.";
        server.replyText(answer("Trước đó.\n\n[[image:5]]\n\nỞ giữa."), "STOP");

        TextAnswer got = translator(List.of()).translate(withMarkers(source), m -> {});

        assertThat(got.text()).isEqualTo("Trước đó.\n\nỞ giữa.").doesNotContain("[[image:");
    }

    @Test
    void markersDoNotCountInTheLengthAndEndingChecks() {
        String source = sourceOf(1000, ".") + "\n\n[[image:9]]";
        server.replyText(answer(answerOf(300, ".")), "STOP");

        assertThatThrownBy(() -> translator(List.of()).translate(withMarkers(source), m -> {}))
                .isInstanceOf(TextIncompleteException.class).hasMessageContaining("shorter");
    }

    @Test
    void otherStopReasonsStayFailures() {
        server.replyText(answer("x"), "SAFETY");

        assertThatThrownBy(() -> translator(List.of()).translate(prompt("en", null, null), m -> {}))
                .isInstanceOf(TranslationFailedException.class);
    }

    @Test
    void sendsTheConfiguredThinkingLevel() {
        server.replyText(answer(GOOD), "STOP");

        translatorThinking("minimal").translate(prompt("en", null, null), m -> {});

        assertThat(server.lastBody()).contains("thinkingConfig").contains("\"thinkingLevel\":\"MINIMAL\"");
    }

    @Test
    void sendsNoThinkingConfigWhenTheLevelIsBlank() {
        server.replyText(answer(GOOD), "STOP");

        translatorThinking(" ").translate(prompt("en", null, null), m -> {});

        assertThat(server.lastBody()).doesNotContain("thinkingConfig");
    }
}
