package com.subtitlestudio.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LocalOriginFilterTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void get_with_foreign_host_is_403() throws Exception {
        mvc.perform(get("/api/ping").header("Host", "evil.example"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN_ORIGIN"))
                .andExpect(jsonPath("$.title").value("Forbidden"))
                .andExpect(jsonPath("$.detail").value("Request from another site was blocked."));
    }

    @Test
    void foreign_host_response_is_problem_json() throws Exception {
        var result = mvc.perform(get("/api/ping").header("Host", "evil.example")).andReturn();
        assertThat(result.getResponse().getContentType()).startsWith("application/problem+json");
    }

    @Test
    void get_with_localhost_host_any_port_is_allowed() throws Exception {
        mvc.perform(get("/api/ping").header("Host", "localhost:8080")).andExpect(status().isNoContent());
        mvc.perform(get("/api/ping").header("Host", "127.0.0.1:5173")).andExpect(status().isNoContent());
    }

    @Test
    void post_with_foreign_origin_is_403() throws Exception {
        mvc.perform(post("/api/publish").header("Origin", "https://evil.example"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN_ORIGIN"));
    }

    @Test
    void post_with_null_origin_is_403() throws Exception {
        mvc.perform(post("/api/publish").header("Origin", "null")).andExpect(status().isForbidden());
    }

    @Test
    void post_from_vite_dev_origin_passes_filter() throws Exception {
        var result = mvc.perform(post("/api/publish")
                .header("Origin", "http://localhost:5173").header("Host", "localhost:5173")).andReturn();
        assertThat(result.getResponse().getStatus()).isNotEqualTo(403);
    }

    @Test
    void post_without_origin_passes_filter() throws Exception {
        var result = mvc.perform(post("/api/publish")).andReturn();
        assertThat(result.getResponse().getStatus()).isNotEqualTo(403);
    }

    @Test
    void non_api_paths_are_not_filtered() throws Exception {
        var result = mvc.perform(get("/").header("Host", "evil.example")).andReturn();
        assertThat(result.getResponse().getStatus()).isNotEqualTo(403);
    }
}
