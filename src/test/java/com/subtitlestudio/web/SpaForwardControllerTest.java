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
        "/profiles", "/profiles/", "/photos", "/photos/", "/works", "/works/", "/works/new", "/works/7", "/works/7/edit", "/profiles/emi", "/profiles/emibonnie/", "/vietsub/playlists", "/vietsub/playlists/12",
        "/vietsub/playlists/12/", "/vietsub/profiles", "/vietsub/profiles/", "/vietsub/dQw4w9WgXcQ/edit", "/vietsub/dQw4w9WgXcQ/edit/"})
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

    @ParameterizedTest
    @ValueSource(strings = {"/nope", "/nope/", "/a/b", "/a/b/", "/novels/1/chapters/2/", "/x/y/z/w", "/x/y/z/w/",
        "/vietsub/list", "/not-a-route/1/2"})
    void forwardsAnyExtensionlessNonApiPathSoTheAppCanShowItsOwnNotFound(String path) throws Exception {
        mvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"/logo.webp", "/assets/missing.js", "/assets/app-123.css", "/favicon.ico", "/index.html.bak"})
    void doesNotForwardPathsWithAFileExtension(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isNotFound());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api", "/api/nope", "/api/nope/", "/api/a/b/c", "/api/a/b/c/d"})
    void apiPathsAreNeverForwarded(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isNotFound());
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
