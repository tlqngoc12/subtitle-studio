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

    private GeminiTranslatorImpl translatorThinking(String level) {
        var gemini = new SubtitleStudioProperties.Gemini(KEY, "gemini-test-flash", Duration.ofSeconds(10),
                Duration.ofMinutes(60), Duration.ofMinutes(45), 0.3, List.of(), level);
        return new GeminiTranslatorImpl(gemini, new ObjectMapper(), server.baseUrl());
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
    void sendsApprovedExamplesAndDescriptionBetweenProfileAndSubtitles() {
        server.replyText(GOOD, "STOP");
        VideoContext context = new VideoContext("VLOG OF US", "EMIBONNIE", "Cast: Emi as Mon",
                List.of(new ExamplePair("Did you see Mon?", "Em thấy Mon không?")));

        translator().translate(context, PROFILE, LINES);

        String body = server.lastBody();
        assertThat(body).contains("# Ví dụ đã được người dịch duyệt").contains("Did you see Mon?")
                .contains("Em thấy Mon không?");
        assertThat(body).contains("Cast: Emi as Mon").contains("description");
        assertThat(body.indexOf("Emi gọi Bonnie là")).isLessThan(body.indexOf("Did you see Mon?"));
        assertThat(body.indexOf("Did you see Mon?")).isLessThan(body.indexOf("Hungry"));
        assertThat(body).contains("Phần ví dụ đã duyệt").contains("không dịch mô tả");
    }

    @Test
    void omitsExamplesAndDescriptionWhenThereAreNone() {
        server.replyText(GOOD, "STOP");

        translator().translate(new VideoContext("VLOG OF US", "EMIBONNIE", null, List.of()), PROFILE, LINES);

        assertThat(server.lastBody()).doesNotContain("# Ví dụ đã được người dịch duyệt").doesNotContain("description");
    }

    @Test
    void sendsThePreviousPartBeforeTheLinesOnlyWhenThereIsOne() {
        server.replyText(GOOD, "STOP");
        VideoContext part2 = new VideoContext("VLOG OF US", "EMIBONNIE", null, List.of(),
                List.of(new ExamplePair("See you soon", "Hẹn gặp lại")));

        translator().translate(part2, PROFILE, LINES);

        String body = server.lastBody();
        assertThat(body).contains("# Đoạn ngay trước (để giữ mạch, KHÔNG dịch lại)").contains("Hẹn gặp lại");
        assertThat(body.indexOf("Hẹn gặp lại")).isLessThan(body.indexOf("Hungry"));
        assertThat(body).contains("Đoạn ngay trước");

        translator().translate(VIDEO, PROFILE, LINES); // part 1: no previous lines

        assertThat(server.lastBody()).doesNotContain("# Đoạn ngay trước (để giữ mạch");
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
        server.reply(429, quota429("m", "20h5m3s"));

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
                + "limit: 20, model: " + model
                + (retry.contains("h") ? ", description: Generate content requests per day limit exceeded on Free Tier."
                        : "\\nPlease retry in " + retry + ".");
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
    void safetyBlockNamesTheFinishReasonAndLogsTheRatings(CapturedOutput output) {
        server.reply(200, "{\"candidates\":[{\"finishReason\":\"SAFETY\",\"safetyRatings\":["
                + "{\"category\":\"HARM_CATEGORY_HARASSMENT\",\"probability\":\"HIGH\",\"blocked\":true},"
                + "{\"category\":\"HARM_CATEGORY_HATE_SPEECH\",\"probability\":\"LOW\"}]}]}");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e))
                        .isEqualTo("Gemini refused to translate this content (SAFETY)."));
        assertThat(output).contains("returned no usable text: finishReason=SAFETY, blockReason=none, "
                + "flagged=HARM_CATEGORY_HARASSMENT:HIGH");
    }

    @Test
    void blockedPromptNamesTheBlockReason(CapturedOutput output) {
        server.reply(200, "{\"promptFeedback\":{\"blockReason\":\"PROHIBITED_CONTENT\"}}");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES))
                .satisfies(e -> assertThat(userMessage(e))
                        .isEqualTo("Gemini blocked this content (PROHIBITED_CONTENT)."));
        assertThat(output).contains("finishReason=none, blockReason=PROHIBITED_CONTENT, flagged=none");
    }

    @Test
    void emptyTextWithStopKeepsThePlainMessage() {
        server.reply(200, "{\"candidates\":[{\"finishReason\":\"STOP\"}]}");

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

    @Test
    void sendsTheConfiguredThinkingLevel() {
        server.replyText(GOOD, "STOP");

        translatorThinking("low").translate(VIDEO, PROFILE, LINES);

        assertThat(server.lastBody()).contains("thinkingConfig").contains("\"thinkingLevel\":\"LOW\"");
    }

    @Test
    void sendsNoThinkingConfigWhenTheLevelIsBlank() {
        server.replyText(GOOD, "STOP");

        translatorThinking("").translate(VIDEO, PROFILE, LINES);

        assertThat(server.lastBody()).doesNotContain("thinkingConfig");
    }

    private static List<SourceLine> numbered(int count) {
        return java.util.stream.IntStream.range(0, count).mapToObj(i -> new SourceLine(i, "line " + i)).toList();
    }

    private static String answer(int from, int to) {
        return java.util.stream.IntStream.range(from, to).mapToObj(i -> "{\"id\":" + i + ",\"text\":\"dòng " + i + "\"}")
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
    }

    @Test
    void asksAgainOnlyForTheMissingTailAndMergesInOrder() {
        List<SourceLine> lines = numbered(10);
        server.queueText(answer(0, 7));
        server.queueText(answer(7, 10));

        List<TranslatedLine> out = translator().translate(VIDEO, PROFILE, lines);

        assertThat(out).extracting(TranslatedLine::id).containsExactly(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
        assertThat(server.requests()).isEqualTo(2);
        String second = server.bodies().get(1);
        assertThat(second).contains("line 7").contains("line 8").contains("line 9").doesNotContain("line 6\"");
        assertThat(second).contains("Đoạn ngay trước").contains("dòng 6").contains("line 6");
    }

    @Test
    void failsWithTheValidCountWhenLinesAreStillMissingAfterTwoFollowUps(CapturedOutput output) {
        server.queueText(answer(0, 6));
        server.queueText(answer(6, 8));
        server.queueText(answer(8, 9));

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, numbered(10)))
                .satisfies(e -> assertThat(userMessage(e))
                        .isEqualTo("Gemini returned missing or mismatched lines (9/10 valid), try again."));

        assertThat(server.requests()).isEqualTo(3);
        assertThat(output).contains("follow-up 1/2").contains("follow-up 2/2").doesNotContain("line 9");
    }

    @Test
    void anAnswerThatIsNotJsonUsesOneAttemptThenASuccessfulAnswerWins() {
        server.queueText("xin lỗi");
        server.queueText(GOOD);

        List<TranslatedLine> out = translator().translate(VIDEO, PROFILE, LINES);

        assertThat(out).extracting(TranslatedLine::id).containsExactly(0, 1);
        assertThat(server.requests()).isEqualTo(2);
    }

    @Test
    void anExtraIdIsIgnoredWithoutAskingAgain() {
        server.queueText("[{\"id\":0,\"text\":\"a\"},{\"id\":1,\"text\":\"b\"},{\"id\":9,\"text\":\"x\"}]");

        List<TranslatedLine> out = translator().translate(VIDEO, PROFILE, LINES);

        assertThat(out).extracting(TranslatedLine::id).containsExactly(0, 1);
        assertThat(server.requests()).isEqualTo(1);
    }

    @Test
    void aFailureOfTheFollowUpItselfIsNotRetried() {
        server.queueText(answer(0, 1));
        server.queueText("{}", "SAFETY");

        assertThatThrownBy(() -> translator().translate(VIDEO, PROFILE, LINES))
                .isInstanceOf(TranslationFailedException.class);
        assertThat(server.requests()).isEqualTo(2);
    }

    // ---- echo of the source line ----

    /** An answer item for position {@code id} that carries the English start and Vietnamese text of line {@code of}. */
    private static String item(int id, int of) {
        return "{\"id\":" + id + ",\"src\":\"line " + of + "\",\"text\":\"dòng " + of + "\"}";
    }

    /** Items for ids {@code from..to-1}, each carrying its own line. */
    private static String own(int from, int to) {
        return java.util.stream.IntStream.range(from, to).mapToObj(i -> item(i, i))
                .collect(java.util.stream.Collectors.joining(","));
    }

    /** Items for ids {@code from..to-1}, each carrying the line {@code shift} after its own. */
    private static String shifted(int from, int to, int shift) {
        return java.util.stream.IntStream.range(from, to).mapToObj(i -> item(i, i + shift))
                .collect(java.util.stream.Collectors.joining(","));
    }

    private static boolean asks(String body, int id) {
        return body.contains("\\\"id\\\":" + id + ",");
    }

    @Test
    void asksForTheSrcEchoOfEveryLine() {
        server.replyText(GOOD, "STOP");

        translator().translate(VIDEO, PROFILE, LINES);

        assertThat(server.lastBody()).contains("\"required\":[\"id\",\"src\",\"text\"]").contains("\"src\":{");
        assertThat(GeminiTranslatorImpl.SYSTEM_RULES).contains("\"src\"").contains("3 từ đầu tiên");
    }

    @Test
    void asksAgainForSlidLinesAndPutsEachOnItsOwnId() {
        // 20 lines; the model drops the content of line 8 but keeps numbering: ids 8-18 carry lines 9-19, id 19 is absent.
        server.queueText("[" + own(0, 8) + "," + shifted(8, 19, 1) + "]");
        server.queueText("[" + own(8, 20) + "]");

        List<TranslatedLine> out = translator().translate(VIDEO, PROFILE, numbered(20));

        assertThat(server.requests()).isEqualTo(2);
        String second = server.bodies().get(1);
        for (int id = 8; id < 20; id++) {
            assertThat(asks(second, id)).as("asks %d", id).isTrue();
        }
        assertThat(asks(second, 7)).isFalse();
        assertThat(out).hasSize(20);
        for (int i = 0; i < 20; i++) {
            assertThat(out.get(i)).isEqualTo(new TranslatedLine(i, "dòng " + i));
        }
    }

    @Test
    void catchesAMergeAndASplitWithTheRightCount() {
        // Line 5 and 6 merged into id 5; the lines after it slide one id early until line 12 is split over ids 11 and 12.
        server.queueText("[" + own(0, 6) + "," + shifted(6, 11, 1) + "," + item(11, 12) + "," + item(12, 12) + ","
                + own(13, 20) + "]");
        server.queueText("[" + own(6, 20) + "]");

        List<TranslatedLine> out = translator().translate(VIDEO, PROFILE, numbered(20));

        assertThat(server.requests()).isEqualTo(2);
        String second = server.bodies().get(1);
        assertThat(asks(second, 5)).isFalse();
        for (int id = 6; id < 20; id++) {
            assertThat(asks(second, id)).as("asks %d", id).isTrue();
        }
        assertThat(out).extracting(TranslatedLine::text)
                .containsExactlyElementsOf(java.util.stream.IntStream.range(0, 20).mapToObj(i -> "dòng " + i).toList());
    }

    @Test
    void aSingleParaphrasedEchoAsksAgainOnlyForThatLine() {
        server.queueText("[" + own(0, 4) + "," + item(4, 15) + "," + own(5, 10) + "]");
        server.queueText("[" + own(4, 5) + "]");

        List<TranslatedLine> out = translator().translate(VIDEO, PROFILE, numbered(10));

        assertThat(server.requests()).isEqualTo(2);
        String second = server.bodies().get(1);
        assertThat(asks(second, 4)).isTrue();
        assertThat(asks(second, 5)).isFalse();
        assertThat(out).hasSize(10);
        assertThat(out.get(4).text()).isEqualTo("dòng 4");
    }

    @Test
    void logsEchoMismatchesWithoutSubtitleText(CapturedOutput output) {
        server.queueText("[" + own(0, 8) + "," + shifted(8, 19, 1) + "]");
        server.queueText("[" + own(8, 20) + "]");

        translator().translate(VIDEO, PROFILE, numbered(20));

        assertThat(output).contains("echoMismatch=11 noEcho=0 firstMismatchId=8");
        assertThat(output).doesNotContain("line 8").doesNotContain("line 9").doesNotContain("dòng");
    }
}
