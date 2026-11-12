package com.subtitlestudio.photo;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.InvalidBlockException;
import com.subtitlestudio.web.ApiExceptionHandler;
import java.time.LocalDate;
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

@WebMvcTest(PhotoController.class)
@Import(ApiExceptionHandler.class)
class PhotoControllerTest {

    private static final PhotoPostDto DTO = new PhotoPostDto(5, "https://www.instagram.com/p/AAA/", "/api/media/9", 1080,
            1350, "Title", LocalDate.parse("2026-11-09"), PhotoSource.OFFICIAL, 3, List.of("emi"));
    private static final String BODY = """
            {"postUrl":"https://www.instagram.com/p/AAA/","mediaId":9,"title":"Title","takenOn":"2026-11-09",
             "source":"OFFICIAL","photoCount":3,"profiles":["emi"]}""";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PhotoService service;

    @MockitoBean
    private XFetchService xFetch;

    private ResultActions json(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(BODY));
    }

    @Test
    void listsPostsWithIsoDates() throws Exception {
        when(service.list()).thenReturn(List.of(DTO));

        mvc.perform(get("/api/photos")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].takenOn").value("2026-11-09"))
                .andExpect(jsonPath("$[0].width").value(1080))
                .andExpect(jsonPath("$[0].source").value("OFFICIAL"))
                .andExpect(jsonPath("$[0].profiles[0]").value("emi"));
    }

    @Test
    void createsUpdatesAndDeletes() throws Exception {
        when(service.create(any())).thenReturn(DTO);
        when(service.update(org.mockito.ArgumentMatchers.eq(5L), any())).thenReturn(DTO);

        json(post("/api/photos")).andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(5));
        json(put("/api/photos/5")).andExpect(status().isOk());
        mvc.perform(delete("/api/photos/5")).andExpect(status().isNoContent());
        verify(service).delete(5);
    }

    @Test
    void mapsErrors() throws Exception {
        when(service.create(any())).thenThrow(new PhotoPostExistsException("Old title"));
        json(post("/api/photos")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PHOTO_POST_EXISTS"))
                .andExpect(jsonPath("$.title").value("Old title"));

        when(service.update(org.mockito.ArgumentMatchers.eq(7L), any())).thenThrow(new PhotoPostNotFoundException(7));
        json(put("/api/photos/7")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PHOTO_POST_NOT_FOUND"));

        doThrow(new InvalidBlockException(List.of(new FieldError("title", "x")))).when(service).delete(8);
        mvc.perform(delete("/api/photos/8")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("title"));
    }

    @Test
    void xFetchReturnsTheImageAndMapsItsErrors() throws Exception {
        when(xFetch.fetch("https://x.com/a/status/1")).thenReturn(
                new XFetchResult(9, "/api/media/9", 1600, 900, LocalDate.parse("2026-11-11"), "Caption"));
        String req = "{\"url\":\"https://x.com/a/status/1\"}";

        mvc.perform(post("/api/photos/x-fetch").contentType(MediaType.APPLICATION_JSON).content(req))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mediaId").value(9))
                .andExpect(jsonPath("$.mediaUrl").value("/api/media/9")).andExpect(jsonPath("$.width").value(1600))
                .andExpect(jsonPath("$.takenOn").value("2026-11-11")).andExpect(jsonPath("$.title").value("Caption"));

        doThrow(new XPostNotFoundException()).when(xFetch).fetch(any());
        mvc.perform(post("/api/photos/x-fetch").contentType(MediaType.APPLICATION_JSON).content(req))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("X_POST_NOT_FOUND"))
                .andExpect(jsonPath("$.detail").value("Couldn't find a public post at this link"));

        doThrow(new XPostHasNoImageException()).when(xFetch).fetch(any());
        mvc.perform(post("/api/photos/x-fetch").contentType(MediaType.APPLICATION_JSON).content(req))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.detail").value("This post has no image"));

        doThrow(new XUnavailableException("X answered 429")).when(xFetch).fetch(any());
        mvc.perform(post("/api/photos/x-fetch").contentType(MediaType.APPLICATION_JSON).content(req))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.detail").value("X didn't answer, try again or upload the image yourself"));

        doThrow(new InvalidBlockException(List.of(new FieldError("postUrl", "bad")))).when(xFetch).fetch(any());
        mvc.perform(post("/api/photos/x-fetch").contentType(MediaType.APPLICATION_JSON).content(req))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("postUrl"));
    }
}
