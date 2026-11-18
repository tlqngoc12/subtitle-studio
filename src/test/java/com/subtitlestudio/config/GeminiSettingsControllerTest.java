package com.subtitlestudio.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.translate.GeminiModelLister;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(GeminiSettingsController.class)
class GeminiSettingsControllerTest {

    private static final String KEY = "AIza-SECRET-KEY-123";

    private static final SubtitleStudioProperties.Gemini DEFAULTS = new SubtitleStudioProperties.Gemini(KEY, "main",
            Duration.ofMinutes(3), Duration.ofMinutes(180), Duration.ofMinutes(45), 0.3, List.of("f1"), "low",
            Duration.ofMinutes(10));

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private GeminiSettings settings;

    @MockitoBean
    private GeminiModelLister models;

    @BeforeEach
    void stub() {
        when(settings.defaults()).thenReturn(DEFAULTS);
        when(settings.current()).thenReturn(DEFAULTS);
        when(settings.overridden()).thenReturn(Set.of());
    }

    @Test
    void getReturnsEffectiveDefaultsOverridden() throws Exception {
        var overridden = new SubtitleStudioProperties.Gemini(KEY, "other", Duration.ofSeconds(90),
                Duration.ofMinutes(180), Duration.ofMinutes(45), 0.5, List.of(), "high", Duration.ofMinutes(5));
        when(settings.current()).thenReturn(overridden);
        when(settings.overridden()).thenReturn(Set.of(GeminiSettings.MODEL, GeminiSettings.TIMEOUT));

        mvc.perform(get("/api/settings/gemini")).andExpect(status().isOk())
                .andExpect(jsonPath("$.effective.model").value("other"))
                .andExpect(jsonPath("$.effective.timeoutSeconds").value(90))
                .andExpect(jsonPath("$.effective.overloadCooldownMinutes").value(5))
                .andExpect(jsonPath("$.effective.thinkingLevel").value("high"))
                .andExpect(jsonPath("$.defaults.model").value("main"))
                .andExpect(jsonPath("$.defaults.fallbackModels[0]").value("f1"))
                .andExpect(jsonPath("$.defaults.timeoutSeconds").value(180))
                .andExpect(jsonPath("$.overridden.length()").value(2))
                .andExpect(jsonPath("$.configured").value(true));
    }

    @Test
    void putSavesAndReturns() throws Exception {
        mvc.perform(put("/api/settings/gemini").contentType(MediaType.APPLICATION_JSON).content("""
                {"model":"other","fallbackModels":["x","y"],"thinkingLevel":"high","temperature":0.7,
                 "timeoutSeconds":120,"overloadCooldownMinutes":15}"""))
                .andExpect(status().isOk()).andExpect(jsonPath("$.effective.model").value("main"));

        var form = ArgumentCaptor.forClass(GeminiSettings.Form.class);
        verify(settings).save(form.capture());
        assertThat(form.getValue()).isEqualTo(new GeminiSettings.Form("other", List.of("x", "y"), "high", 0.7,
                Duration.ofSeconds(120), Duration.ofMinutes(15)));
    }

    @Test
    void putInvalidReturns400WithField() throws Exception {
        doThrow(new GeminiSettings.InvalidSettingException("temperature", "Temperature must be from 0 to 2."))
                .when(settings).save(any());

        mvc.perform(put("/api/settings/gemini").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"temperature\":9}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_SETTING"))
                .andExpect(jsonPath("$.field").value("temperature"))
                .andExpect(jsonPath("$.detail").value("Temperature must be from 0 to 2."));
    }

    @Test
    void responseNeverContainsApiKey() throws Exception {
        String got = mvc.perform(get("/api/settings/gemini")).andReturn().getResponse().getContentAsString();
        String saved = mvc.perform(put("/api/settings/gemini").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andReturn().getResponse().getContentAsString();

        assertThat(got).isNotBlank().doesNotContain(KEY).doesNotContainIgnoringCase("apikey");
        assertThat(saved).isNotBlank().doesNotContain(KEY).doesNotContainIgnoringCase("apikey");
    }

    @Test
    void modelsReturnsTheListerResult() throws Exception {
        when(models.list()).thenReturn(List.of("gemini-a", "gemini-b"));

        mvc.perform(get("/api/settings/gemini/models")).andExpect(status().isOk())
                .andExpect(jsonPath("$[1]").value("gemini-b"));
    }
}
