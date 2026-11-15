package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.subtitlestudio.config.SubtitleStudioProperties;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class GeminiCallerTest {

    private static final String MAIN = "gemini-test-flash";
    private static final String LITE = "gemini-test-lite";
    private static final String THIRD = "gemini-test-third";
    private static final String BUSY = "{\"error\":{\"code\":503,\"message\":\"High demand.\",\"status\":\"UNAVAILABLE\"}}";
    private static final String DAILY = "{\"error\":{\"code\":429,\"message\":\"Quota exceeded for metric: "
            + "generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, "
            + "model: x\\nPlease retry in 30000s.\",\"status\":\"RESOURCE_EXHAUSTED\"}}";
    private static final Duration SLOW = Duration.ofSeconds(2);

    private final FakeGeminiServer server = new FakeGeminiServer();

    @AfterEach
    void stop() {
        server.close();
    }

    private GeminiCaller callerAt(String baseUrl, String... fallbacks) {
        var gemini = new SubtitleStudioProperties.Gemini("test-key", MAIN, Duration.ofMillis(300),
                Duration.ofMinutes(60), 0.3, List.of(fallbacks));
        return new GeminiCaller(gemini, baseUrl);
    }

    private GeminiCaller caller(String... fallbacks) {
        return callerAt(server.baseUrl(), fallbacks);
    }

    private static List<Part> parts() {
        return List.of(Part.fromText("hello"));
    }

    private static String userMessage(Throwable e) {
        return ((TranslationFailedException) e).userMessage();
    }

    @Test
    void aTimeoutFallsBackToTheNextModel() {
        server.delayForModel(MAIN, SLOW);
        server.replyForModel(LITE, 200, "{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"ok\"}]},"
                + "\"finishReason\":\"STOP\"}]}");
        List<String> tried = new ArrayList<>();

        GeminiCaller.Answer answer = caller(LITE).generate(parts(), GenerateContentConfig.builder().build(), tried::add);

        assertThat(answer.text()).isEqualTo("ok");
        assertThat(answer.model()).isEqualTo(LITE);
        assertThat(tried).containsExactly(MAIN, LITE);
    }

    @Test
    void allModelsTimingOutFails() {
        server.delay(SLOW);

        assertThatThrownBy(() -> caller(LITE).generate(parts(), GenerateContentConfig.builder().build()))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini did not respond in time."));
    }

    @Test
    void aTimeoutThenBusyStillReportsTheTimeout() {
        server.delayForModel(MAIN, SLOW);
        server.replyForModel(LITE, 503, BUSY);

        assertThatThrownBy(() -> caller(LITE).generate(parts(), GenerateContentConfig.builder().build()))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini did not respond in time."));
    }

    @Test
    void busyThenDailyQuotaThenTimeoutReportsTheTimeout() {
        server.replyForModel(MAIN, 503, BUSY);
        server.replyForModel(LITE, 429, DAILY);
        server.delayForModel(THIRD, SLOW);

        assertThatThrownBy(() -> caller(LITE, THIRD).generate(parts(), GenerateContentConfig.builder().build()))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Gemini did not respond in time."));
    }

    @Test
    void aConnectionErrorDoesNotFallBack() {
        String deadUrl = server.baseUrl();
        server.close();
        List<String> tried = new ArrayList<>();

        assertThatThrownBy(() -> callerAt(deadUrl, LITE).generate(parts(), GenerateContentConfig.builder().build(), tried::add))
                .satisfies(e -> assertThat(userMessage(e)).isEqualTo("Could not translate: connection to Gemini failed."));
        assertThat(tried).containsExactly(MAIN);
    }
}
