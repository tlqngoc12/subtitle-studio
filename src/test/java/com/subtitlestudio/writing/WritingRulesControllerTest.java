package com.subtitlestudio.writing;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.web.ApiExceptionHandler;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(WritingRulesController.class)
@Import(ApiExceptionHandler.class)
class WritingRulesControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private WritingRulesStore store;

    private static String body(int length) {
        return "{\"text\":\"" + "a".repeat(length) + "\"}";
    }

    @Test
    void getWithoutFileReturnsNull() throws Exception {
        when(store.read()).thenReturn(Optional.empty());
        mvc.perform(get("/api/settings/writing-rules"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value((Object) null));
    }

    @Test
    void getReturnsText() throws Exception {
        when(store.read()).thenReturn(Optional.of("## Cụm cấm"));
        mvc.perform(get("/api/settings/writing-rules"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("## Cụm cấm"));
    }

    @Test
    void putWritesText() throws Exception {
        mvc.perform(put("/api/settings/writing-rules").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"abc\"}"))
                .andExpect(status().isNoContent());
        verify(store).write("abc");
    }

    @Test
    void putTooLongIsRejected() throws Exception {
        mvc.perform(put("/api/settings/writing-rules").contentType(MediaType.APPLICATION_JSON).content(body(20_001)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("WRITING_RULES_TOO_LONG"));
        verify(store, never()).write(anyString());
    }

    @Test
    void putExactlyMaxIsAccepted() throws Exception {
        mvc.perform(put("/api/settings/writing-rules").contentType(MediaType.APPLICATION_JSON).content(body(20_000)))
                .andExpect(status().isNoContent());
    }

    @Test
    void putMissingTextIsBadRequest() throws Exception {
        mvc.perform(put("/api/settings/writing-rules").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        verify(store, never()).write(anyString());
    }
}
