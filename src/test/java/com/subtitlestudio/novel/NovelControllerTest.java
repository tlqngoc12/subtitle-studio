package com.subtitlestudio.novel;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
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

@WebMvcTest(NovelController.class)
@Import(ApiExceptionHandler.class)
class NovelControllerTest {

    private static final Instant AT = Instant.parse("2026-11-05T10:00:00Z");
    static final NovelDetail DETAIL = new NovelDetail(3, "summer-love", "Tình Yêu Mùa Hạ", null, null, "ผู้เขียน",
            "Giới thiệu", List.of("romance"), NovelStatus.ONGOING, "Dịch: @byZenQN", null, "SummerLove",
            NotebookStatus.IDLE, null, List.of());
    private static final String BODY = """
            {"slug":"summer-love","title":"Tình Yêu Mùa Hạ","tags":["romance"],"novelStatus":"ONGOING"}""";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private NovelService service;

    @MockitoBean
    private NotebookService notebook;

    @MockitoBean
    private ChapterService chapterService;

    @Test
    void reordersChapters() throws Exception {
        ChapterSummary row = new ChapterSummary(11, 1, null, null, ChapterTranslationStatus.NONE, null,
                ChapterPublishStatus.DRAFT, 0, 0);
        when(service.get(3L)).thenReturn(new NovelDetail(3, "s", "T", null, null, null, null, List.of(),
                NovelStatus.ONGOING, null, null, null, NotebookStatus.IDLE, null, List.of(row)));

        mvc.perform(put("/api/novels/3/chapters/order").contentType(MediaType.APPLICATION_JSON)
                .content("{\"chapterIds\":[11,10]}")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(11));
        verify(chapterService).reorderChapters(3L, new ChapterOrderRequest(List.of(11L, 10L)));

        doThrow(new InvalidChapterException(List.of(new FieldError("chapterIds", "x"))))
                .when(chapterService).reorderChapters(eq(3L), any());
        mvc.perform(put("/api/novels/3/chapters/order").contentType(MediaType.APPLICATION_JSON)
                .content("{\"chapterIds\":[11]}")).andExpect(status().isBadRequest());
    }

    @Test
    void notebookViewAndRetry() throws Exception {
        when(notebook.view(3L, 5)).thenReturn(new NotebookView(5, NotebookContent.EMPTY, List.of(2, 5),
                NotebookStatus.IDLE, null, true));

        mvc.perform(get("/api/novels/3/notebook").param("after", "5")).andExpect(status().isOk())
                .andExpect(jsonPath("$.afterChapterNo").value(5))
                .andExpect(jsonPath("$.versions[1]").value(5))
                .andExpect(jsonPath("$.staleLaterVersions").value(true));
        mvc.perform(post("/api/novels/3/notebook/retry")).andExpect(status().isAccepted());
        verify(notebook).retry(3L);
    }

    @Test
    void retryWhileUpdatingIs409() throws Exception {
        doThrow(new NotebookUpdateInProgressException(3)).when(notebook).retry(3L);

        mvc.perform(post("/api/novels/3/notebook/retry")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOTEBOOK_UPDATE_IN_PROGRESS"));
    }

    @Test
    void listsNovels() throws Exception {
        when(service.list()).thenReturn(List.of(new NovelSummary(3, "summer-love", "Tình Yêu Mùa Hạ", null,
                NovelStatus.ONGOING, 12, 8, AT)));

        mvc.perform(get("/api/novels")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].slug").value("summer-love"))
                .andExpect(jsonPath("$[0].chapterCount").value(12))
                .andExpect(jsonPath("$[0].publishedCount").value(8));
    }

    @Test
    void createsNovel() throws Exception {
        when(service.create(any())).thenReturn(DETAIL);

        mvc.perform(post("/api/novels").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(3))
                .andExpect(jsonPath("$.notebookStatus").value("IDLE"));
    }

    @Test
    void updatesAndDeletes() throws Exception {
        when(service.update(eq(3L), any())).thenReturn(DETAIL);

        mvc.perform(put("/api/novels/3").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/novels/3")).andExpect(status().isNoContent());
        verify(service).delete(3L);
    }

    @Test
    void notFoundIs404() throws Exception {
        when(service.get(anyLong())).thenThrow(new NovelNotFoundException(9));

        mvc.perform(get("/api/novels/9")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOVEL_NOT_FOUND"));
    }

    @Test
    void invalidIs400WithFieldErrors() throws Exception {
        when(service.create(any())).thenThrow(new InvalidNovelException(
                List.of(new FieldError("slug", "Use lowercase letters, numbers and single hyphens."))));

        mvc.perform(post("/api/novels").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_NOVEL"))
                .andExpect(jsonPath("$.errors[0].field").value("slug"));
    }

    @Test
    void duplicateSlugIs409() throws Exception {
        doThrow(new DuplicateNovelSlugException("summer-love")).when(service).create(any());

        mvc.perform(post("/api/novels").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DUPLICATE_NOVEL_SLUG"));
    }
}
