package com.subtitlestudio.playlist;

import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.video.VideoNotFoundException;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@WebMvcTest(PlaylistController.class)
@Import(ApiExceptionHandler.class)
class PlaylistControllerTest {

    private static final Instant AT = Instant.parse("2026-11-04T10:00:00Z");
    private static final PlaylistDetail DETAIL = new PlaylistDetail(7, "VLOG OF US", "Daily", AT, List.of());

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PlaylistService service;

    private ResultActions json(MockHttpServletRequestBuilder request, String body) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static void expectProblem(ResultActions result, int status, String code) throws Exception {
        result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
    }

    @Test
    void listsPlaylistsWithoutContainsVideo() throws Exception {
        when(service.list(null)).thenReturn(List.of(new PlaylistSummary(7, "VLOG OF US", null, 2,
                "https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg", AT, null)));

        mvc.perform(get("/api/playlists")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(7))
                .andExpect(jsonPath("$[0].videoCount").value(2))
                .andExpect(jsonPath("$[0].thumbnailUrl").value("https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg"))
                .andExpect(jsonPath("$[0].containsVideo").doesNotExist());
    }

    @Test
    void listsPlaylistsForVideo() throws Exception {
        when(service.list("aaaaaaaaaaa")).thenReturn(List.of(new PlaylistSummary(7, "P", null, 1, null, AT, true)));

        mvc.perform(get("/api/playlists").param("videoId", "aaaaaaaaaaa")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].containsVideo").value(true));
    }

    @Test
    void createsPlaylist() throws Exception {
        when(service.create("VLOG OF US", "Daily")).thenReturn(DETAIL);

        json(post("/api/playlists"), "{\"name\":\"VLOG OF US\",\"description\":\"Daily\"}")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.videos").isArray());
    }

    @Test
    void getsPlaylist() throws Exception {
        when(service.get(7)).thenReturn(DETAIL);

        mvc.perform(get("/api/playlists/7")).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("VLOG OF US"));
    }

    @Test
    void updatesPlaylist() throws Exception {
        when(service.update(7, "New", null)).thenReturn(DETAIL);

        json(patch("/api/playlists/7"), "{\"name\":\"New\"}").andExpect(status().isOk());
        verify(service).update(7, "New", null);
    }

    @Test
    void deletesPlaylist() throws Exception {
        mvc.perform(delete("/api/playlists/7")).andExpect(status().isNoContent());
        verify(service).delete(7);
    }

    @Test
    void addsVideo() throws Exception {
        when(service.addVideo(7, "aaaaaaaaaaa")).thenReturn(DETAIL);

        json(post("/api/playlists/7/videos"), "{\"videoId\":\"aaaaaaaaaaa\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(7));
    }

    @Test
    void removesVideo() throws Exception {
        mvc.perform(delete("/api/playlists/7/videos/aaaaaaaaaaa")).andExpect(status().isNoContent());
        verify(service).removeVideo(7, "aaaaaaaaaaa");
    }

    @Test
    void reordersVideos() throws Exception {
        when(service.reorder(7, List.of("bbbbbbbbbbb", "aaaaaaaaaaa"))).thenReturn(DETAIL);

        json(put("/api/playlists/7/order"), "{\"videoIds\":[\"bbbbbbbbbbb\",\"aaaaaaaaaaa\"]}")
                .andExpect(status().isOk());
    }

    @Test
    void invalidPlaylistIs400WithFieldErrors() throws Exception {
        when(service.create(eq(""), eq(null)))
                .thenThrow(new InvalidPlaylistException(List.of(new FieldError("name", "Name is required"))));

        ResultActions r = json(post("/api/playlists"), "{\"name\":\"\"}");

        expectProblem(r, 400, "INVALID_PLAYLIST");
        r.andExpect(jsonPath("$.errors[0].field").value("name"));
    }

    @Test
    void unknownPlaylistIs404() throws Exception {
        when(service.get(99)).thenThrow(new PlaylistNotFoundException(99));

        expectProblem(mvc.perform(get("/api/playlists/99")), 404, "PLAYLIST_NOT_FOUND");
    }

    @Test
    void unknownVideoIs404() throws Exception {
        when(service.addVideo(anyLong(), anyString())).thenThrow(new VideoNotFoundException("zzzzzzzzzzz"));

        expectProblem(json(post("/api/playlists/7/videos"), "{\"videoId\":\"zzzzzzzzzzz\"}"), 404, "VIDEO_NOT_FOUND");
    }

    @Test
    void videoWithoutVietsubIs409() throws Exception {
        when(service.addVideo(anyLong(), anyString())).thenThrow(new VideoHasNoVietsubException("ccccccccccc"));

        expectProblem(json(post("/api/playlists/7/videos"), "{\"videoId\":\"ccccccccccc\"}"), 409,
                "VIDEO_HAS_NO_VIETSUB");
    }

    @Test
    void badOrderIs400() throws Exception {
        doThrow(new InvalidPlaylistOrderException()).when(service).reorder(eq(7L), org.mockito.ArgumentMatchers.any());

        expectProblem(json(put("/api/playlists/7/order"), "{\"videoIds\":[]}"), 400, "INVALID_PLAYLIST_ORDER");
    }
}
