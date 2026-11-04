package com.subtitlestudio.publish;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.web.ApiExceptionHandler;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PublishController.class)
@Import(ApiExceptionHandler.class)
class PublishControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PublishService service;

    @Test
    void startReturns202WithStatus() throws Exception {
        when(service.start()).thenReturn(new PublishStatus("PUBLISHING", true, null, "https://fans.pages.dev", null));

        mvc.perform(post("/api/publish")).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("PUBLISHING"))
                .andExpect(jsonPath("$.url").value("https://fans.pages.dev"));
    }

    @Test
    void secondStartIs409() throws Exception {
        when(service.start()).thenThrow(new PublishInProgressException());

        mvc.perform(post("/api/publish")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PUBLISH_IN_PROGRESS"));
    }

    @Test
    void notConfiguredIs503() throws Exception {
        when(service.start()).thenThrow(new PublishNotConfiguredException());

        mvc.perform(post("/api/publish")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("PUBLISH_NOT_CONFIGURED"));
    }

    @Test
    void getReturnsStatus() throws Exception {
        when(service.status()).thenReturn(new PublishStatus("DONE", true, Instant.parse("2026-11-04T10:00:30Z"),
                "https://fans.pages.dev", null));

        mvc.perform(get("/api/publish")).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DONE"))
                .andExpect(jsonPath("$.configured").value(true))
                .andExpect(jsonPath("$.lastPublishedAt").value("2026-11-04T10:00:30Z"));
    }
}
