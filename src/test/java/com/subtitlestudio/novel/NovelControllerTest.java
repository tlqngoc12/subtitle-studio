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
            "dQw4w9WgXcQ", NotebookStatus.IDLE, null, List.of(), NovelSourceType.SCREENSHOTS, "th", null);
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

    @MockitoBean
    private com.subtitlestudio.novel.wattpad.WattpadNovelService wattpadNovels;

    @Test
    void reordersChapters() throws Exception {
        ChapterSummary row = new ChapterSummary(11, 1, null, null, ChapterTranslationStatus.NONE, null, null,
                ChapterPublishStatus.DRAFT, 0, 0);
        when(service.get(3L)).thenReturn(new NovelDetail(3, "s", "T", null, null, null, null, List.of(),
                NovelStatus.ONGOING, null, null, null, null, NotebookStatus.IDLE, null, List.of(row),
                NovelSourceType.SCREENSHOTS, "th", null));

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
    void featuredEndpointReturnsTheSummary() throws Exception {
        when(service.setFeatured(3, true)).thenReturn(new NovelSummary(3, "summer-love", "T", null,
                NovelStatus.ONGOING, 1, 1, AT, null, true, AT, AT, null, null));

        mvc.perform(put("/api/novels/3/featured").contentType(MediaType.APPLICATION_JSON)
                .content("{\"featured\":true}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.featured").value(true));
    }

    @Test
    void aFullBannerIs409BannerFull() throws Exception {
        when(service.setFeatured(3, true)).thenThrow(new BannerFullException());

        mvc.perform(put("/api/novels/3/featured").contentType(MediaType.APPLICATION_JSON)
                .content("{\"featured\":true}")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("BANNER_FULL"));
    }

    @Test
    void featuredOfAnUnknownNovelIs404() throws Exception {
        when(service.setFeatured(eq(9L), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenThrow(new NovelNotFoundException(9));

        mvc.perform(put("/api/novels/9/featured").contentType(MediaType.APPLICATION_JSON)
                .content("{\"featured\":true}")).andExpect(status().isNotFound());
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

    private static final String WATTPAD_BODY = """
            {"slug":"warm","title":"Warm","tags":[],"novelStatus":"COMPLETED","sourceType":"WATTPAD",
            "sourceLanguage":"en","wattpadStoryId":"396487502","coverUrl":"https://img.wattpad.com/cover/1-256-x.jpg"}""";

    @Test
    void aWattpadNovelIsCreatedThroughTheWattpadService() throws Exception {
        when(wattpadNovels.create(any())).thenReturn(DETAIL);

        mvc.perform(post("/api/novels").contentType(MediaType.APPLICATION_JSON).content(WATTPAD_BODY))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(3));
        verify(wattpadNovels).create(any());
        verify(service, org.mockito.Mockito.never()).create(any());
    }

    @Test
    void aDuplicateWattpadStoryIs409WithTheExistingNovel() throws Exception {
        when(wattpadNovels.create(any())).thenThrow(new DuplicateWattpadNovelException("Warm", 12));

        mvc.perform(post("/api/novels").contentType(MediaType.APPLICATION_JSON).content(WATTPAD_BODY))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOVEL_WATTPAD_EXISTS"))
                .andExpect(jsonPath("$.novelId").value(12));
    }

    @Test
    void wattpadPreviewReturnsThePrefill() throws Exception {
        when(wattpadNovels.preview("https://www.wattpad.com/story/396487502")).thenReturn(
                new com.subtitlestudio.novel.wattpad.WattpadNovelPreview("396487502", "Warm", "emi", "About",
                        List.of("gl"), true, "English", "en", 28, "https://img.wattpad.com/c.jpg",
                        "https://www.wattpad.com/story/396487502", null,
                        List.of(new com.subtitlestudio.novel.wattpad.WattpadPreviewPart("1", "Prologue", 190, AT,
                                false)), "Warm"));

        mvc.perform(post("/api/novels/wattpad/preview").contentType(MediaType.APPLICATION_JSON)
                .content("{\"url\":\"https://www.wattpad.com/story/396487502\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Warm")).andExpect(jsonPath("$.sourceLanguage").value("en"))
                .andExpect(jsonPath("$.partCount").value(28)).andExpect(jsonPath("$.existingNovelId").doesNotExist())
                .andExpect(jsonPath("$.parts[0].partId").value("1"))
                .andExpect(jsonPath("$.suggestedProfile").value("Warm"));
    }

    @Test
    void fetchTranslateReturns202() throws Exception {
        when(wattpadNovels.fetchAndTranslate(3L, "77")).thenReturn(new ChapterDetail(9, 3, "Warm", 1, "One", null,
                ChapterTranslationStatus.TRANSLATING, null, null, null, false, ChapterPublishStatus.DRAFT, List.of(),
                "", null, null, "text", "77", null, "en"));

        mvc.perform(post("/api/novels/3/wattpad/parts/77/fetch-translate")).andExpect(status().isAccepted())
                .andExpect(jsonPath("$.translationStatus").value("TRANSLATING"));
    }

    @Test
    void fetchTranslateBusyIs409() throws Exception {
        when(wattpadNovels.fetchAndTranslate(3L, "77")).thenThrow(new NovelTranslationBusyException(3));

        mvc.perform(post("/api/novels/3/wattpad/parts/77/fetch-translate")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOVEL_TRANSLATION_BUSY"));
    }

    @Test
    void wattpadPreviewErrorsKeepTheirCodes() throws Exception {
        when(wattpadNovels.preview(any())).thenThrow(
                new com.subtitlestudio.fanfic.InvalidFanficLinkException("Paste a Wattpad story link"));
        mvc.perform(post("/api/novels/wattpad/preview").contentType(MediaType.APPLICATION_JSON)
                .content("{\"url\":\"x\"}")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_FANFIC_LINK"));

        doThrow(new com.subtitlestudio.fanfic.WattpadUnavailableException("down")).when(wattpadNovels)
                .preview(any());
        mvc.perform(post("/api/novels/wattpad/preview").contentType(MediaType.APPLICATION_JSON)
                .content("{\"url\":\"x\"}")).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("WATTPAD_UNAVAILABLE"));
    }

    @Test
    void wattpadPartsAndImport() throws Exception {
        when(wattpadNovels.parts(3L)).thenReturn(List.of(new com.subtitlestudio.novel.wattpad.WattpadPartRow("1",
                "Prologue", 190, AT, AT, false, null)));
        when(wattpadNovels.importParts(eq(3L), any())).thenReturn(new com.subtitlestudio.novel.wattpad.WattpadImportResult(
                List.of(new com.subtitlestudio.novel.wattpad.WattpadImportResult.Imported("1", 20)), List.of("2"),
                List.of(new com.subtitlestudio.novel.wattpad.WattpadImportResult.Failure("3", "Three", "No text"))));

        mvc.perform(get("/api/novels/3/wattpad/parts")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].partId").value("1")).andExpect(jsonPath("$[0].wordCount").value(190))
                .andExpect(jsonPath("$[0].importedChapterId").doesNotExist());
        mvc.perform(post("/api/novels/3/wattpad/import").contentType(MediaType.APPLICATION_JSON)
                .content("{\"partIds\":[\"1\",\"2\",\"3\"]}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.imported[0].chapterId").value(20)).andExpect(jsonPath("$.skipped[0]").value("2"))
                .andExpect(jsonPath("$.failed[0].reason").value("No text"));
    }

    @Test
    void wattpadPartsOfAScreenshotNovelIs409() throws Exception {
        when(wattpadNovels.parts(3L)).thenThrow(new NovelNotWattpadException(3));

        mvc.perform(get("/api/novels/3/wattpad/parts")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOVEL_NOT_WATTPAD"));
    }
}
