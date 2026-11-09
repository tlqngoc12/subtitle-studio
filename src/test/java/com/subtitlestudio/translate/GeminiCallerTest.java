package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.Part;
import com.subtitlestudio.config.SubtitleStudioProperties;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class GeminiCallerTest {

    private final FakeGeminiServer server = new FakeGeminiServer();

    @AfterEach
    void stop() {
        server.close();
    }

    private GeminiCaller caller(List<String> fallbacks) {
        var gemini = new SubtitleStudioProperties.Gemini("k", "m1", Duration.ofSeconds(10), Duration.ofMinutes(60), 0.3,
                fallbacks);
        return new GeminiCaller(gemini, server.baseUrl());
    }

    @Test
    void reportsEachModelBeforeTryingIt() {
        server.replyText("ok", "STOP");
        server.replyForModel("m1", 503, "{}");
        List<String> tried = new ArrayList<>();

        GeminiCaller.Answer answer = caller(List.of("m2")).generate(List.of(Part.fromText("hi")),
                GenerateContentConfig.builder().build(), tried::add);

        assertThat(tried).containsExactly("m1", "m2");
        assertThat(answer.model()).isEqualTo("m2");
    }

    @Test
    void twoArgumentOverloadStillWorks() {
        server.replyText("ok", "STOP");

        assertThat(caller(List.of()).generate(List.of(Part.fromText("hi")), GenerateContentConfig.builder().build())
                .model()).isEqualTo("m1");
    }
}
