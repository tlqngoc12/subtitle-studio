package com.subtitlestudio.fanfic;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.web.ApiExceptionHandler;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@WebMvcTest(FanficController.class)
@Import(ApiExceptionHandler.class)
class FanficControllerTest {

    private static final FanficDto DTO = new FanficDto(5L, "https://www.wattpad.com/story/1", "Warm", "emibonnie",
            "About", List.of("gl"), "/api/media/9", 51029, 2167, 28, 15739, 68, true,
            Instant.parse("2026-11-07T12:15:30Z"), Instant.parse("2026-11-11T01:00:00Z"),
            Instant.parse("2026-11-10T01:00:00Z"));
    private static final String BODY = "{\"url\":\"https://www.wattpad.com/story/1\"}";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private FanficService service;

    private ResultActions json(String path) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(BODY));
    }

    @Test
    void listsFanficsWithIsoInstants() throws Exception {
        when(service.list()).thenReturn(List.of(DTO));

        mvc.perform(get("/api/fanfics")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Warm"))
                .andExpect(jsonPath("$[0].readingMinutes").value(68))
                .andExpect(jsonPath("$[0].storyUpdatedAt").value("2026-11-07T12:15:30Z"))
                .andExpect(jsonPath("$[0].tags[0]").value("gl"))
                .andExpect(jsonPath("$[0].coverUrl").value("/api/media/9"));
    }

    @Test
    void previewAddRefreshAndDelete() throws Exception {
        when(service.preview("https://www.wattpad.com/story/1")).thenReturn(DTO);
        when(service.add("https://www.wattpad.com/story/1")).thenReturn(DTO);
        when(service.refresh(5)).thenReturn(DTO);
        when(service.refreshAll()).thenReturn(new RefreshAllResult(2, List.of(new RefreshAllResult.Failure(7, "Gone",
                "Story not found or not public."))));

        json("/api/fanfics/preview").andExpect(status().isOk()).andExpect(jsonPath("$.id").value(5));
        json("/api/fanfics").andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(5));
        mvc.perform(post("/api/fanfics/5/refresh")).andExpect(status().isOk());
        mvc.perform(post("/api/fanfics/refresh")).andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(2))
                .andExpect(jsonPath("$.failed[0].id").value(7))
                .andExpect(jsonPath("$.failed[0].title").value("Gone"))
                .andExpect(jsonPath("$.failed[0].message").value("Story not found or not public."));
        mvc.perform(delete("/api/fanfics/5")).andExpect(status().isNoContent());
        verify(service).delete(5);
    }

    @Test
    void mapsErrors() throws Exception {
        when(service.preview(any())).thenThrow(new InvalidFanficLinkException("Paste a Wattpad story link."));
        json("/api/fanfics/preview").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_FANFIC_LINK"))
                .andExpect(jsonPath("$.detail").value("Paste a Wattpad story link."));

        when(service.add(any())).thenThrow(new FanficNotFoundException());
        json("/api/fanfics").andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("FANFIC_NOT_FOUND"))
                .andExpect(jsonPath("$.detail").value("Story not found or not public."));

        when(service.refresh(6)).thenThrow(new WattpadUnavailableException("403"));
        mvc.perform(post("/api/fanfics/6/refresh")).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("WATTPAD_UNAVAILABLE"))
                .andExpect(jsonPath("$.detail").value("Wattpad did not answer. Try again later."));

        org.mockito.Mockito.doThrow(new FanficExistsException("Old title")).when(service).add(any());
        json("/api/fanfics").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("FANFIC_EXISTS"))
                .andExpect(jsonPath("$.title").value("Old title"));
    }
}
