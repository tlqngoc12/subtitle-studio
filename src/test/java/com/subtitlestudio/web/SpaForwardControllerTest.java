package com.subtitlestudio.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(SpaForwardController.class)
@Import(ApiExceptionHandler.class)
class SpaForwardControllerTest {

    @Autowired
    private MockMvc mvc;

    @ParameterizedTest
    @ValueSource(strings = {"/vietsub", "/vietsub/", "/vietsub/list", "/vietsub/dQw4w9WgXcQ", "/vietsub/dQw4w9WgXcQ/",
        "/profiles", "/profiles/", "/profiles/emi", "/profiles/emibonnie/", "/vietsub/playlists", "/vietsub/playlists/12",
        "/vietsub/playlists/12/"})
    void forwardsVietsubRoutesToIndex(String path) throws Exception {
        mvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/novels", "/novels/", "/novels/new", "/novels/3", "/novels/3/", "/novels/3/chapters/9",
        "/novels/3/chapters/9/"})
    void forwardsNovelRoutesToIndex(String path) throws Exception {
        mvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));
    }

    @Test
    void unknownNovelApiPathStillReturns404() throws Exception {
        mvc.perform(get("/api/novels/x/y/z")).andExpect(status().isNotFound());
    }

    @Test
    void unknownApiPathStillReturns404() throws Exception {
        mvc.perform(get("/api/khong-co")).andExpect(status().isNotFound());
    }
}
