package com.subtitlestudio.video;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.subtitle.InvalidSrtException;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.url.InvalidUrlException;
import com.subtitlestudio.web.ApiExceptionHandler;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@WebMvcTest(VietsubController.class)
@Import(ApiExceptionHandler.class)
class VietsubControllerTest {

    private static final String ID = "dQw4w9WgXcQ";
    private static final String URL = "https://youtu.be/" + ID;
    private static final byte[] SRT = "1\n00:00:01,000 --> 00:00:02,000\nXin chào\n".getBytes(StandardCharsets.UTF_8);

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private VietsubService service;

    private ResultActions postVietsub() throws Exception {
        return mvc.perform(multipart("/api/vietsub")
                .file(new MockMultipartFile("file", "vi.srt", "application/x-subrip", SRT))
                .param("url", URL));
    }

    private static Video video() {
        Video v = new Video(ID);
        v.update("Học Spring Boot", "Dev", 754, "en", SourceType.MANUAL, 10, Instant.parse("2026-11-02T10:00:00Z"));
        v.updateVietsub(2, Instant.parse("2026-11-02T11:00:00Z"));
        return v;
    }

    @Test
    void addReturnsVideo() throws Exception {
        when(service.add(URL, SRT)).thenReturn(video());

        postVietsub()
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(ID))
                .andExpect(jsonPath("$.viCueCount").value(2));

        verify(service).add(URL, SRT);
    }

    @Test
    void invalidSrtReturns400() throws Exception {
        when(service.add(URL, SRT)).thenThrow(new InvalidSrtException("Block 3 is longer than 1000 characters"));

        expectProblem(postVietsub(), 400, "INVALID_SRT")
                .andExpect(jsonPath("$.detail").value(containsString("Block 3")));
    }

    @Test
    void tooLargeReturns413() throws Exception {
        when(service.add(URL, SRT)).thenThrow(new MaxUploadSizeExceededException(5 * 1024 * 1024));

        expectProblem(postVietsub(), 413, "FILE_TOO_LARGE");
    }

    @Test
    void invalidUrlReturns400() throws Exception {
        when(service.add(URL, SRT)).thenThrow(new InvalidUrlException(URL));

        expectProblem(postVietsub(), 400, "INVALID_URL");
    }

    @Test
    void listsCues() throws Exception {
        when(service.getCues(ID)).thenReturn(List.of(new ViCue(1_000, 2_000, "Xin chào")));

        mvc.perform(get("/api/videos/" + ID + "/vietsub"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].startMs").value(1000))
                .andExpect(jsonPath("$[0].endMs").value(2000))
                .andExpect(jsonPath("$[0].text").value("Xin chào"));
    }

    @Test
    void unknownVideoReturns404() throws Exception {
        when(service.getCues(ID)).thenThrow(new VideoNotFoundException(ID));

        expectProblem(mvc.perform(get("/api/videos/" + ID + "/vietsub")), 404, "VIDEO_NOT_FOUND");
    }

    @Test
    void deleteReturns204() throws Exception {
        mvc.perform(delete("/api/videos/" + ID + "/vietsub")).andExpect(status().isNoContent());

        verify(service).clear(ID);
    }

    @Test
    void deleteUnknownReturns404() throws Exception {
        doThrow(new VideoNotFoundException(ID)).when(service).clear(ID);

        expectProblem(mvc.perform(delete("/api/videos/" + ID + "/vietsub")), 404, "VIDEO_NOT_FOUND");
    }

    private static ResultActions expectProblem(ResultActions result, int status, String code) throws Exception {
        return result
                .andExpect(status().is(status))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.detail").isNotEmpty());
    }
}
