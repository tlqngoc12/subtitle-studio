package com.subtitlestudio.publish;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(NovelReadsController.class)
class NovelReadsControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private NovelReadsService service;

    @Test
    void returnsTheCountsBySlug() throws Exception {
        when(service.counts()).thenReturn(Map.of("summer", 12L));

        mvc.perform(get("/api/novels/reads")).andExpect(status().isOk()).andExpect(jsonPath("$.summer").value(12));
    }
}
