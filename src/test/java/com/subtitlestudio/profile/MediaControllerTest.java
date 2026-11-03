package com.subtitlestudio.profile;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.web.ApiExceptionHandler;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@WebMvcTest(MediaController.class)
@Import(ApiExceptionHandler.class)
class MediaControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private MediaService service;

    private ResultActions upload() throws Exception {
        return mvc.perform(multipart("/api/media")
                .file(new MockMultipartFile("file", "a.png", "image/png", ImageSnifferTest.PNG)));
    }

    private static void expectProblem(ResultActions result, int status, String code) throws Exception {
        result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
    }

    @Test
    void uploadReturnsIdAndUrl() throws Exception {
        Media m = mock(Media.class);
        when(m.getId()).thenReturn(51L);
        when(service.store(eq("a.png"), any())).thenReturn(m);

        upload().andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(51))
                .andExpect(jsonPath("$.url").value("/api/media/51"));
    }

    @Test
    void missingFileIsInvalidMedia() throws Exception {
        expectProblem(mvc.perform(multipart("/api/media")), 400, "INVALID_MEDIA");
    }

    @Test
    void invalidMediaReturns400() throws Exception {
        when(service.store(any(), any())).thenThrow(new InvalidMediaException("Not an image"));

        expectProblem(upload(), 400, "INVALID_MEDIA");
    }

    @Test
    void tooLargeReturns413() throws Exception {
        when(service.store(any(), any())).thenThrow(new MediaTooLargeException());

        expectProblem(upload(), 413, "MEDIA_TOO_LARGE");
    }

    @Test
    void multipartLimitOnMediaIsMediaTooLarge() throws Exception {
        when(service.store(any(), any())).thenThrow(new MaxUploadSizeExceededException(10 * 1024 * 1024));

        expectProblem(upload(), 413, "MEDIA_TOO_LARGE");
    }

    @Test
    void servesStoredFileWithCacheHeaders(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("51.png");
        Files.write(file, ImageSnifferTest.PNG);
        when(service.load(51)).thenReturn(new StoredMedia(file, "image/png"));

        mvc.perform(get("/api/media/51"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/png"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", "public, max-age=31536000, immutable"))
                .andExpect(content().bytes(ImageSnifferTest.PNG));
    }

    @Test
    void unknownMediaReturns404() throws Exception {
        when(service.load(9)).thenThrow(new MediaNotFoundException(9));

        expectProblem(mvc.perform(get("/api/media/9")), 404, "MEDIA_NOT_FOUND");
    }
}
