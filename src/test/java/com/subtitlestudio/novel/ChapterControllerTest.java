package com.subtitlestudio.novel;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.web.ApiExceptionHandler;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ChapterController.class)
@Import(ApiExceptionHandler.class)
class ChapterControllerTest {

    static final ChapterDetail DETAIL = new ChapterDetail(9, 3, "Tình Yêu", 1, "Mở đầu",
            ChapterTranslationStatus.NONE, null, null, false, ChapterPublishStatus.DRAFT,
            List.of(new PageDto(11, 1, "/api/media/5", null)), null, null);

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ChapterService service;

    @Test
    void addsChapter() throws Exception {
        when(service.add(eq(3L), any())).thenReturn(DETAIL);

        mvc.perform(post("/api/novels/3/chapters").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(9))
                .andExpect(jsonPath("$.pages[0].mediaUrl").value("/api/media/5"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void uploadsSeveralFiles() throws Exception {
        when(service.addPages(eq(9L), any())).thenReturn(List.of(new PageDto(11, 1, "/api/media/5", null),
                new PageDto(12, 2, "/api/media/6", null)));

        mvc.perform(multipart("/api/chapters/9/pages")
                        .file(new MockMultipartFile("files", "p2.png", "image/png", TestImages.png()))
                        .file(new MockMultipartFile("files", "p1.png", "image/png", TestImages.png())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.length()").value(2));

        ArgumentCaptor<List<NamedImage>> files = ArgumentCaptor.forClass(List.class);
        verify(service).addPages(eq(9L), files.capture());
        org.assertj.core.api.Assertions.assertThat(files.getValue()).extracting(NamedImage::name)
                .containsExactly("p2.png", "p1.png");
    }

    @Test
    void reordersAndDeletesPage() throws Exception {
        mvc.perform(put("/api/chapters/9/pages/order").contentType(MediaType.APPLICATION_JSON)
                .content("{\"pageIds\":[12,11]}")).andExpect(status().isOk());
        verify(service).reorder(9L, new PageOrderRequest(List.of(12L, 11L)));

        mvc.perform(delete("/api/chapters/9/pages/12")).andExpect(status().isNoContent());
        verify(service).deletePage(9L, 12L);
    }

    @Test
    void errorCodes() throws Exception {
        when(service.get(1L)).thenThrow(new ChapterNotFoundException(1));
        when(service.get(2L)).thenThrow(new InvalidChapterException(List.of(new FieldError("chapterNo", "x"))));
        when(service.get(3L)).thenThrow(new DuplicateChapterNumberException(4));
        when(service.get(4L)).thenThrow(new InvalidPageOrderException());
        when(service.get(5L)).thenThrow(new PageNotFoundException(7));
        when(service.get(6L)).thenThrow(new ChapterTranslationInProgressException(6));

        expect(1, 404, "CHAPTER_NOT_FOUND");
        expect(2, 400, "INVALID_CHAPTER");
        expect(3, 409, "DUPLICATE_CHAPTER_NUMBER");
        expect(4, 400, "INVALID_PAGE_ORDER");
        expect(5, 404, "PAGE_NOT_FOUND");
        expect(6, 409, "TRANSLATION_IN_PROGRESS");
    }

    private void expect(long id, int status, String code) throws Exception {
        mvc.perform(get("/api/chapters/" + id)).andExpect(status().is(status))
                .andExpect(jsonPath("$.code").value(code));
    }

    @Test
    void updatesChapter() throws Exception {
        when(service.update(anyLong(), any())).thenReturn(DETAIL);

        mvc.perform(put("/api/chapters/9").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"x\",\"pages\":[{\"id\":11,\"textVi\":\"Chào\"}]}"))
                .andExpect(status().isOk());
        verify(service).update(9L, new ChapterUpdateRequest(null, "x", List.of(new PageTextEdit(11, "Chào"))));
    }
}
