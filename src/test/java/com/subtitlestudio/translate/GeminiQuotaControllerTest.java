package com.subtitlestudio.translate;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.config.GeminiSettings;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.GeminiQuotaTracker.QuotaKind;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(GeminiQuotaController.class)
@Import({GeminiQuotaTracker.class, GeminiQuotaControllerTest.Fixed.class})
class GeminiQuotaControllerTest {

    @TestConfiguration
    static class Fixed {
        @Bean
        Clock clock() {
            return Clock.fixed(Instant.parse("2026-01-15T12:00:00Z"), ZoneOffset.UTC);
        }
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private GeminiQuotaTracker tracker;

    @MockitoBean
    private GeminiSettings settings;

    @org.junit.jupiter.api.BeforeEach
    void forget() {
        tracker.clear();
    }

    private void models(String main, String... fallbacks) {
        when(settings.current()).thenReturn(new SubtitleStudioProperties.Gemini("secret-key", main,
                Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3, List.of(fallbacks)));
    }

    @Test
    void nothingExhaustedReportsTheMainModel() throws Exception {
        models("m1", "m2");

        mvc.perform(get("/api/gemini/quota")).andExpect(status().isOk())
                .andExpect(jsonPath("$.exhausted.length()").value(0)).andExpect(jsonPath("$.nowUsing").value("m1"));
    }

    @Test
    void listsExhaustedModelsAndTheFirstOneLeft() throws Exception {
        models("m1", "m2");
        tracker.record("m1", QuotaKind.DAILY, Instant.parse("2026-01-16T08:00:00Z"));

        mvc.perform(get("/api/gemini/quota")).andExpect(status().isOk())
                .andExpect(jsonPath("$.exhausted.length()").value(1))
                .andExpect(jsonPath("$.exhausted[0].model").value("m1"))
                .andExpect(jsonPath("$.exhausted[0].kind").value("DAILY"))
                .andExpect(jsonPath("$.exhausted[0].resetAt").value("2026-01-16T08:00:00Z"))
                .andExpect(jsonPath("$.nowUsing").value("m2"));
    }

    @Test
    void nowUsingIsNullWhenEveryModelIsExhausted() throws Exception {
        models("m1");
        tracker.record("m1", QuotaKind.DAILY, Instant.parse("2026-01-16T08:00:00Z"));

        mvc.perform(get("/api/gemini/quota")).andExpect(status().isOk())
                .andExpect(jsonPath("$.nowUsing").doesNotExist());
    }

    @Test
    void neverExposesTheApiKey() throws Exception {
        models("m1");

        String body = mvc.perform(get("/api/gemini/quota")).andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body).doesNotContain("secret-key");
    }
}
