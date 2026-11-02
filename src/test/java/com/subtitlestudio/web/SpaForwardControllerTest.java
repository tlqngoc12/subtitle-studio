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
    @ValueSource(strings = {"/vietsub", "/vietsub/", "/vietsub/dQw4w9WgXcQ", "/vietsub/dQw4w9WgXcQ/"})
    void forwardsVietsubRoutesToIndex(String path) throws Exception {
        mvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));
    }

    @Test
    void unknownApiPathStillReturns404() throws Exception {
        mvc.perform(get("/api/khong-co")).andExpect(status().isNotFound());
    }
}
