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

class GeminiTextChapterTranslatorTest {

    private static final String SOURCE = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";

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

    private static TextChapterPrompt prompt(String language, String carrySource, String carryTranslation) {
        return new TextChapterPrompt("Warm", 3, null, "Hồ sơ: dịch mượt", "## Nhân vật\nEmi", "Chương trước đây",
                language, carrySource, carryTranslation, SOURCE);
    }

    private static String answer(String text) {
        return "{\"text\":\"" + text.replace("\n", "\\n") + "\"}";
    }

    @Test
    void sendsTheWholeChapterInOneRequestWithTheContext() {
        server.replyText(answer("Một.\n\nHai.\n\nBa."), "STOP");

        TextAnswer got = translator(List.of()).translate(prompt("en", null, null), m -> {});

        assertThat(server.requests()).isEqualTo(1);
        assertThat(got.text()).isEqualTo("Một.\n\nHai.\n\nBa.");
        assertThat(got.model()).isEqualTo("gemini-test-flash");
        String body = server.lastBody();
        assertThat(body).contains("systemInstruction").contains("tiếng Anh").contains("responseSchema");
        assertThat(body).contains("# Hồ sơ dịch").contains("Hồ sơ: dịch mượt");
        assertThat(body).contains("# Sổ tay truyện").contains("## Nhân vật");
        assertThat(body).contains("# Chương trước (bản dịch)").contains("Chương trước đây");
        assertThat(body).contains("Chương 3").contains("Warm");
        assertThat(body).contains("First paragraph.").contains("Third paragraph.");
        assertThat(body).doesNotContain("Cuối phần gốc đã dịch");
        assertThat(body).doesNotContain("MEDIA_RESOLUTION");
    }

    @Test
    void thaiRulesAreOnlySentForThai() {
        server.replyText(answer("Một.\n\nHai.\n\nBa."), "STOP");
        translator(List.of()).translate(prompt("th", null, null), m -> {});
        String thai = server.lastBody();
        server.replyText(answer("Một.\n\nHai.\n\nBa."), "STOP");
        translator(List.of()).translate(prompt("en", null, null), m -> {});
        String english = server.lastBody();

        assertThat(thai).contains("tiếng Thái").contains("Không để sót chữ Thái");
        assertThat(english).contains("tiếng Anh").doesNotContain("Không để sót chữ Thái").doesNotContain("tiếng Thái");
    }

    @Test
    void laterPartsCarryTheEndOfThePreviousPart() {
        server.replyText(answer("Một.\n\nHai.\n\nBa."), "STOP");

        translator(List.of()).translate(prompt("en", "the old source end", "đoạn dịch cũ"), m -> {});

        assertThat(server.lastBody()).contains("# Đoạn ngay trước (để giữ mạch, KHÔNG dịch lại)")
                .contains("the old source end").contains("đoạn dịch cũ");
    }

    @Test
    void reportsEachModelItTries() {
        server.replyForModel("gemini-test-flash", 503, "{\"error\":{\"code\":503,\"message\":\"busy\"}}");
        server.replyText(answer("Một.\n\nHai.\n\nBa."), "STOP");
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
        server.replyText(answer("Một.\n\nHai.\n\nBa."), "STOP");
        var prompt = new TextChapterPrompt("Warm", 3, null, "p", null, null, "en", null, null, source);

        assertThatThrownBy(() -> translator(List.of()).translate(prompt, m -> {}))
                .isInstanceOf(TextIncompleteException.class);
    }

    @Test
    void anAnswerAboveTheThresholdIsAccepted() {
        String source = String.join("\n\n", java.util.Collections.nCopies(10, "A paragraph."));
        server.replyText(answer("Một.\n\nHai.\n\nBa.\n\nBốn."), "STOP");
        var prompt = new TextChapterPrompt("Warm", 3, null, "p", null, null, "en", null, null, source);

        assertThat(translator(List.of()).translate(prompt, m -> {}).text()).startsWith("Một.");
    }

    @Test
    void otherStopReasonsStayFailures() {
        server.replyText(answer("x"), "SAFETY");

        assertThatThrownBy(() -> translator(List.of()).translate(prompt("en", null, null), m -> {}))
                .isInstanceOf(TranslationFailedException.class);
    }
}
