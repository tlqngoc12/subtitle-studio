package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.FakeGeminiServer;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.translate.TranslationFailedException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class GeminiChapterTranslatorTest {

    private static final String GOOD = "{\"pages\":[{\"page\":2,\"text\":\"Hai\"},{\"page\":1,\"text\":\"Một\"}]}";
    private static final byte[] IMG1 = "jpeg-one".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] IMG2 = "jpeg-two".getBytes(StandardCharsets.US_ASCII);

    private final FakeGeminiServer server = new FakeGeminiServer();

    @AfterEach
    void stop() {
        server.close();
    }

    private GeminiChapterTranslator translator(List<String> fallbacks) {
        var gemini = new SubtitleStudioProperties.Gemini("k", "gemini-test-flash", Duration.ofSeconds(10),
                Duration.ofMinutes(60), 0.3, fallbacks);
        return new GeminiChapterTranslator(new GeminiCaller(gemini, server.baseUrl()), gemini, new ObjectMapper());
    }

    private static ChapterPrompt prompt(String notebook, String previous, String carry) {
        return new ChapterPrompt("Tình Yêu Mùa Hạ", 3, "Ngôn ngữ gốc: tiếng Thái", notebook, previous, carry,
                List.of(new PageImage(1, IMG1), new PageImage(2, IMG2)));
    }

    @Test
    void sendsPagesInOrderWithLabelsAndImages() {
        server.replyText(GOOD, "STOP");

        translator(List.of()).translate(prompt("## Nhân vật\nA", "Chương trước đây", "đoạn cuối"));

        String body = server.lastBody();
        assertThat(body).contains("systemInstruction").contains("Ngôn ngữ gốc: tiếng Thái");
        assertThat(body).contains("# Sổ tay truyện").contains("## Nhân vật");
        assertThat(body).contains("# Chương trước (bản dịch)").contains("Chương trước đây");
        assertThat(body).contains("# Đoạn cuối lượt trước").contains("đoạn cuối");
        assertThat(body).contains("Chương 3").contains("Tình Yêu Mùa Hạ");
        String b1 = Base64.getEncoder().encodeToString(IMG1);
        String b2 = Base64.getEncoder().encodeToString(IMG2);
        assertThat(body.indexOf("Page 1")).isLessThan(body.indexOf(b1));
        assertThat(body.indexOf(b1)).isLessThan(body.indexOf("Page 2"));
        assertThat(body.indexOf("Page 2")).isLessThan(body.indexOf(b2));
        assertThat(body).contains("image/jpeg").contains("MEDIA_RESOLUTION_HIGH").contains("responseSchema");
    }

    @Test
    void leavesOutEmptySections() {
        server.replyText(GOOD, "STOP");

        translator(List.of()).translate(prompt(null, null, null));

        assertThat(server.lastBody()).doesNotContain("# Sổ tay truyện").doesNotContain("# Chương trước")
                .doesNotContain("# Đoạn cuối lượt trước");
    }

    @Test
    void parsesPagesInOrder() {
        server.replyText(GOOD, "STOP");

        assertThat(translator(List.of()).translate(prompt(null, null, null)))
                .containsExactly(new TranslatedPage(1, "Một"), new TranslatedPage(2, "Hai"));
    }

    @Test
    void fallsBackOn503() {
        server.replyText(GOOD, "STOP");
        server.replyForModel("gemini-test-flash", 503, "{}");

        assertThat(translator(List.of("gemini-lite")).translate(prompt(null, null, null))).hasSize(2);
        assertThat(server.lastPath()).contains("/models/gemini-lite:");
    }

    @Test
    void quotaErrorIsNotRetried() {
        server.reply(429, "{}");

        assertThatThrownBy(() -> translator(List.of("gemini-lite")).translate(prompt(null, null, null)))
                .isInstanceOfSatisfying(TranslationFailedException.class,
                        e -> assertThat(e.userMessage()).isEqualTo("Gemini free quota is used up, try again later."));
        assertThat(server.requests()).isEqualTo(1);
    }

    private static final byte[] IMG3 = "jpeg-three".getBytes(StandardCharsets.US_ASCII);

    private static ChapterPrompt threePages() {
        return new ChapterPrompt("Tình Yêu", 5, "Hồ sơ", null, null, null,
                List.of(new PageImage(1, IMG1), new PageImage(2, IMG2), new PageImage(3, IMG3)));
    }

    @Test
    void asksAgainOnlyForTheMissingPages() {
        server.queueText("{\"pages\":[{\"page\":1,\"text\":\"Một\"},{\"page\":2,\"text\":\"Hai\"}]}");
        server.queueText("{\"pages\":[{\"page\":3,\"text\":\"Ba\"}]}");

        List<TranslatedPage> pages = translator(List.of()).translate(threePages());

        assertThat(pages).containsExactly(new TranslatedPage(1, "Một"), new TranslatedPage(2, "Hai"),
                new TranslatedPage(3, "Ba"));
        assertThat(server.requests()).isEqualTo(2);
        String retry = server.bodies().get(1);
        assertThat(retry).contains("Page 3").contains(Base64.getEncoder().encodeToString(IMG3))
                .doesNotContain("Page 1").doesNotContain(Base64.getEncoder().encodeToString(IMG1));
    }

    @Test
    void failsWhenTheRetryIsStillIncomplete() {
        server.queueText("{\"pages\":[{\"page\":1,\"text\":\"Một\"}]}");
        server.queueText("{\"pages\":[{\"page\":2,\"text\":\"Hai\"}]}");

        assertThatThrownBy(() -> translator(List.of()).translate(threePages()))
                .isInstanceOfSatisfying(TranslationFailedException.class, e -> assertThat(e.userMessage())
                        .isEqualTo("Gemini returned an incomplete translation (got 2 of 3 pages)."));
        assertThat(server.requests()).isEqualTo(2);
    }

    @Test
    void logsTheModelAndTheShapeOfAnIncompleteAnswerWithoutText(CapturedOutput output) {
        server.queueText("{\"pages\":[{\"page\":1,\"text\":\"BÍ-MẬT-MỘT\"},{\"page\":2,\"text\":\"Hai\"}]}");
        server.queueText("{\"pages\":[{\"page\":3,\"text\":\"Ba\"}]}");

        translator(List.of()).translate(threePages());

        assertThat(output).contains("gemini-test-flash").contains("missing [3]").contains("chars {1=10, 2=3}")
                .contains("asking again for 1 page")
                .doesNotContain("BÍ-MẬT-MỘT");
    }

    @Test
    void notJsonFails() {
        server.replyText("nope", "STOP");

        assertThatThrownBy(() -> translator(List.of()).translate(prompt(null, null, null)))
                .isInstanceOf(TranslationFailedException.class);
    }
}
