package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

@ExtendWith(OutputCaptureExtension.class)
class GeminiTranslatorImplTest {

    private static final String KEY = "test-key-123";
    private static final VideoContext VIDEO = new VideoContext("VLOG OF US", "EMIBONNIE");
    private static final String PROFILE = "## Xưng hô\nEmi gọi Bonnie là \"em\".";
    private static final List<SourceLine> LINES = List.of(
            new SourceLine(0, "Hello"),
            new SourceLine(1, "- Hungry?\n- A little."));
    private static final String GOOD = "[{\"id\":0,\"text\":\"Xin chào\"},{\"id\":1,\"text\":\"- Đói chưa?\\n- Hơi hơi.\"}]";

    private final FakeGeminiServer server = new FakeGeminiServer();

    @AfterEach
    void stop() {
        server.close();
    }

    private GeminiTranslatorImpl translator(Duration timeout, List<String> fallbackModels) {
        var gemini = new SubtitleStudioProperties.Gemini(KEY, "gemini-test-flash", timeout, Duration.ofMinutes(60), 0.3,
                fallbackModels);
        return new GeminiTranslatorImpl(gemini, new ObjectMapper(), server.baseUrl());
    }

    private GeminiTranslatorImpl translator(Duration timeout) {
        return translator(timeout, List.of());
    }

    private GeminiTranslatorImpl translator() {
        return translator(Duration.ofSeconds(10), List.of());
    }

    private static String userMessage(Throwable e) {
        return ((TranslationFailedException) e).userMessage();
    }

    @Test
    void sendsRulesProfileSchemaAndLines() {
        server.replyText(GOOD, "STOP");

        translator().translate(VIDEO, PROFILE, LINES);

        assertThat(server.lastPath()).endsWith("/models/gemini-test-flash:generateContent");
        String body = server.lastBody();
        assertThat(body).contains("systemInstruction").contains("mỗi id");
        assertThat(body).contains("Emi gọi Bonnie là");
        assertThat(body).contains("application/json").contains("responseSchema");
        assertThat(body).contains("\"temperature\":0.3");
        assertThat(body).contains("VLOG OF US").contains("EMIBONNIE");
        assertThat(body.indexOf("Hello")).isLessThan(body.indexOf("Hungry"));
        assertThat(body).doesNotContain(KEY);
    }

    @Test
    void parsesStructuredOutput() {
        server.replyText(GOOD, "STOP");

        List<TranslatedLine> out = translator().translate(VIDEO, PROFILE, LINES);

        assertThat(out).containsExactly(new TranslatedLine(0, "Xin chào"), new TranslatedLine(1, "- Đói chưa?\n- Hơi hơi."));
        assertThat(server.requests()).isEqualTo(1);
    }

    @Test
    void quota429Fails() {
        server.reply(429, "{\"error\":{\"code\":429,\"message\":\"Resource exhausted\",\"status\":\"RESOURCE_EXHAUSTED\"}}");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini free quota is used up, try again later."));
        assertThat(server.requests()).isEqualTo(1); // no automatic retries burning the free quota
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403})
    void badKeyFails(int status) {
        server.reply(status, "{\"error\":{\"code\":" + status + ",\"message\":\"API key not valid\",\"status\":\"PERMISSION_DENIED\"}}");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("GEMINI_API_KEY is not valid."));
    }

    @Test
    void timeoutFails() {
        server.delay(Duration.ofSeconds(3));
        server.replyText(GOOD, "STOP");

        assertThatThrownBy(() -> translator(Duration.ofSeconds(1)).translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini did not respond in time."));
    }

    @Test
    void fallsBackToTheNextModelWhenBusy() {
        server.replyForModel("gemini-test-flash", 503, "{\"error\":{\"code\":503,\"message\":\"This model is currently experiencing high demand.\",\"status\":\"UNAVAILABLE\"}}");
        server.replyText(GOOD, "STOP");

        List<TranslatedLine> out = translator(Duration.ofSeconds(10), List.of("gemini-test-lite")).translate(VIDEO, PROFILE, LINES);

        assertThat(out).hasSize(2);
        assertThat(server.requests()).isEqualTo(2);
        assertThat(server.lastPath()).endsWith("/models/gemini-test-lite:generateContent");
    }

    @Test
    void reportsBusyWhenEveryModelIsBusy() {
        server.reply(503, "{\"error\":{\"code\":503,\"message\":\"This model is currently experiencing high demand.\",\"status\":\"UNAVAILABLE\"}}");

        assertThatThrownBy(() -> translator(Duration.ofSeconds(10), List.of("gemini-test-lite")).translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e))
                        .isEqualTo("Gemini is busy right now (high demand), try again in a few minutes."));
        assertThat(server.requests()).isEqualTo(2);
    }

    /** The shape of a real free-tier 429 message (the SDK keeps only error.message). */
    private static String quota429(String model, String retry) {
        String message = "You exceeded your current quota, please check your plan and billing details.\\n"
                + "* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, "
                + "limit: 20, model: " + model + "\\nPlease retry in " + retry + ".";
        return "{\"error\":{\"code\":429,\"message\":\"" + message + "\",\"status\":\"RESOURCE_EXHAUSTED\"}}";
    }

    @Test
    void quotaErrorTriesTheNextModel() {
        // Free-tier quotas are counted per model: another model may still have some left.
        server.replyForModel("gemini-test-flash", 429, quota429("gemini-test-flash", "20h5m3s"));
        server.replyText(GOOD, "STOP");

        List<TranslatedLine> out = translator(Duration.ofSeconds(10), List.of("gemini-test-lite"))
                .translate(VIDEO, PROFILE, LINES);

        assertThat(out).hasSize(2);
        assertThat(server.requests()).isEqualTo(2);
        assertThat(server.lastPath()).endsWith("/models/gemini-test-lite:generateContent");
    }

    @Test
    void reportsQuotaWhenEveryModelIsOutOfQuota() {
        server.reply(429, quota429("m", "20h5m3s"));

        assertThatThrownBy(() -> translator(Duration.ofSeconds(10), List.of("gemini-test-lite")).translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini free quota is used up, try again later."));
        assertThat(server.requests()).isEqualTo(2);
    }

    @Test
    void reportsThePerMinuteLimitWhenEveryModelAsksToWaitUnderAMinute() {
        server.reply(429, quota429("m", "33.5s"));

        assertThatThrownBy(() -> translator(Duration.ofSeconds(10), List.of("gemini-test-lite")).translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e))
                        .isEqualTo("Gemini's per-minute limit was reached, try again in a minute."));
    }

    @Test
    void logsWhichQuotaRanOut(CapturedOutput output) {
        server.reply(429, quota429("gemini-test-flash", "33.5s"));

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES));

        assertThat(output).contains("Gemini model gemini-test-flash is out of quota (HTTP 429)")
                .contains("generate_content_free_tier_requests").contains("limit: 20").contains("retry in 33.5s")
                .doesNotContain("billing details");
    }

    @Test
    void safetyBlockFails() {
        server.reply(200, "{\"candidates\":[{\"finishReason\":\"SAFETY\"}]}");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini refused to translate this content."));
    }

    @ParameterizedTest
    @ValueSource(strings = {"```json\n[{\"id\":0,\"text\":\"a\"},{\"id\":1,\"text\":\"b\"}]\n```", "xin lỗi"})
    void fencedOrInvalidJsonFails(String text) {
        server.replyText(text, "STOP");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini returned missing or mismatched lines (0/2 valid), try again."));
    }

    @Test
    void logsModelAndSummaryWhenTheAnswerIsInvalid(CapturedOutput output) {
        server.replyText("[{\"id\":0,\"text\":\"Xin chào\"}]", "STOP");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES)).isInstanceOf(TranslationFailedException.class);

        assertThat(output).contains("gemini-test-flash")
                .contains("items=1 valid=1/2 missing=1 extra=0 duplicated=0 blank=0 missingIds=[1]");
        assertThat(output).doesNotContain("Xin chào").doesNotContain("Hello").doesNotContain(KEY);
    }

    @Test
    void logsWhenTheAnswerIsNotJson(CapturedOutput output) {
        server.replyText("xin lỗi", "STOP");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES)).isInstanceOf(TranslationFailedException.class);

        assertThat(output).contains("gemini-test-flash").contains("not the expected JSON");
        assertThat(output).doesNotContain("xin lỗi");
    }

    @Test
    void logsWhichModelAnswered(CapturedOutput output) {
        server.replyForModel("gemini-test-flash", 503, "{\"error\":{\"code\":503,\"message\":\"busy\",\"status\":\"UNAVAILABLE\"}}");
        server.replyText(GOOD, "STOP");

        translator(Duration.ofSeconds(10), List.of("gemini-test-lite")).translate(VIDEO, PROFILE, LINES);

        assertThat(output).contains("Gemini gemini-test-lite translated 2 lines");
    }

    @Test
    void otherErrorsNeverLeakKey() {
        server.reply(500, "{\"error\":{\"code\":500,\"message\":\"boom " + KEY + "\",\"status\":\"INTERNAL\"}}");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> {
                    assertThat(userMessage(e)).startsWith("Could not translate: ").doesNotContain(KEY);
                    assertThat(e.getMessage()).doesNotContain(KEY);
                });
    }
}
