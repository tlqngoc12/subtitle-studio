package com.subtitlestudio.translate;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PromptProfileController.class)
class PromptProfileControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PromptProfileStore store;

    @MockitoBean
    private SubtitleStudioProperties properties;

    private static SubtitleStudioProperties.Gemini gemini(String key) {
        return new SubtitleStudioProperties.Gemini(key, "gemini-3.8-flash", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3);
    }

    @Test
    void listsProfilesAndConfiguredFlag() throws Exception {
        when(store.list()).thenReturn(List.of("EmiBonnie"));
        when(properties.gemini()).thenReturn(gemini("k"));

        mvc.perform(get("/api/prompt-profiles"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"configured\":true,\"profiles\":[\"EmiBonnie\"]}", true));
    }

    @Test
    void reportsNotConfigured() throws Exception {
        when(store.list()).thenReturn(List.of());
        when(properties.gemini()).thenReturn(gemini(""));

        mvc.perform(get("/api/prompt-profiles"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"configured\":false,\"profiles\":[]}", true));
    }
}
