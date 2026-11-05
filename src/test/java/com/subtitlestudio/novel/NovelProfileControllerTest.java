package com.subtitlestudio.novel;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(NovelProfileController.class)
class NovelProfileControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private NovelProfileStore store;

    @MockitoBean
    private SubtitleStudioProperties properties;

    @Test
    void listsNovelProfiles() throws Exception {
        when(store.list()).thenReturn(List.of("BeMySugar"));
        when(properties.gemini()).thenReturn(new SubtitleStudioProperties.Gemini("key", "m", Duration.ofMinutes(3),
                Duration.ofMinutes(60), 0.3, List.of()));

        mvc.perform(get("/api/novel-profiles")).andExpect(status().isOk())
                .andExpect(jsonPath("$.configured").value(true))
                .andExpect(jsonPath("$.profiles[0]").value("BeMySugar"));
    }
}
