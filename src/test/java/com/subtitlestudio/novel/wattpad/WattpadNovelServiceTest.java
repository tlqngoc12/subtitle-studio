package com.subtitlestudio.novel.wattpad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.subtitlestudio.fanfic.FanficNotFoundException;
import com.subtitlestudio.fanfic.InvalidFanficLinkException;
import com.subtitlestudio.fanfic.WattpadClient;
import com.subtitlestudio.fanfic.WattpadStory;
import com.subtitlestudio.fanfic.WattpadStoryParts;
import com.subtitlestudio.fanfic.WattpadUnavailableException;
import com.subtitlestudio.novel.DuplicateNovelSlugException;
import com.subtitlestudio.novel.DuplicateWattpadNovelException;
import com.subtitlestudio.novel.InvalidNovelException;
import com.subtitlestudio.novel.Novel;
import com.subtitlestudio.novel.NovelDetail;
import com.subtitlestudio.novel.NovelRepository;
import com.subtitlestudio.novel.NovelRequest;
import com.subtitlestudio.novel.NovelService;
import com.subtitlestudio.novel.NovelSourceType;
import com.subtitlestudio.novel.NovelStatus;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaService;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/** Uses a fake Wattpad client; the real Wattpad is never called. */
class WattpadNovelServiceTest {

    private static final String LINK = "https://www.wattpad.com/story/396487502-the-way-she-warmed-me";
    private static final String COVER = "https://img.wattpad.com/cover/396487502-256-k1.jpg";

    private WattpadClient wattpad;
    private NovelRepository novels;
    private NovelService novelService;
    private MediaService mediaService;
    private WattpadNovelService service;
    private com.subtitlestudio.novel.ChapterRepository chapters;
    private com.subtitlestudio.novel.ChapterService chapterService;
    private com.subtitlestudio.novel.ChapterTranslationService translation;
    private com.subtitlestudio.fanfic.Sleeper sleeper;
    private com.subtitlestudio.novel.NovelProfileStore profiles;
    private static final Instant NOW = Instant.parse("2026-11-13T01:00:00Z");

    @BeforeEach
    void setUp() {
        wattpad = mock(WattpadClient.class);
        novels = mock(NovelRepository.class);
        novelService = mock(NovelService.class);
        mediaService = mock(MediaService.class);
        chapters = mock(com.subtitlestudio.novel.ChapterRepository.class);
        chapterService = mock(com.subtitlestudio.novel.ChapterService.class);
        sleeper = mock(com.subtitlestudio.fanfic.Sleeper.class);
        profiles = mock(com.subtitlestudio.novel.NovelProfileStore.class);
        translation = mock(com.subtitlestudio.novel.ChapterTranslationService.class);
        service = new WattpadNovelService(wattpad, novels, novelService, mediaService, chapters, chapterService,
                translation, profiles, sleeper, java.time.Clock.fixed(NOW, java.time.ZoneOffset.UTC));
    }

    private static WattpadStoryParts story(String language) {
        WattpadStory s = new WattpadStory("396487502", "The Way She Warmed Me", "emibonnie", "About it",
                List.of("gl", "romance"), COVER, 10, 5, 28, 15739, true, Instant.parse("2026-11-07T12:00:00Z"));
        return new WattpadStoryParts(s, language, List.of());
    }

    private static NovelRequest request(String coverUrl, Long coverMediaId) {
        return new NovelRequest("the-way-she-warmed-me", "The Way She Warmed Me", coverMediaId, "emibonnie", "About it",
                List.of("gl"), NovelStatus.COMPLETED, null, LINK, null, null, NovelSourceType.WATTPAD, "en",
                "396487502", coverUrl);
    }

    private static Media media(long id) {
        Media m = new Media("image/webp", 10, "c.webp", Instant.parse("2026-11-12T00:00:00Z"));
        ReflectionTestUtils.setField(m, "id", id);
        return m;
    }

    @Test
    void previewBuildsThePrefillAndGuessesEnglish() {
        when(wattpad.storyWithParts("396487502")).thenReturn(story("English"));

        WattpadNovelPreview p = service.preview(LINK);

        assertThat(p.storyId()).isEqualTo("396487502");
        assertThat(p.title()).isEqualTo("The Way She Warmed Me");
        assertThat(p.author()).isEqualTo("emibonnie");
        assertThat(p.description()).isEqualTo("About it");
        assertThat(p.tags()).containsExactly("gl", "romance");
        assertThat(p.completed()).isTrue();
        assertThat(p.languageName()).isEqualTo("English");
        assertThat(p.sourceLanguage()).isEqualTo("en");
        assertThat(p.partCount()).isEqualTo(28);
        assertThat(p.coverUrl()).isEqualTo(COVER);
        assertThat(p.storyUrl()).isEqualTo("https://www.wattpad.com/story/396487502");
        assertThat(p.existingNovelId()).isNull();
    }

    @Test
    void previewListsThePartsInStoryOrder() {
        WattpadStoryParts base = story("English");
        when(wattpad.storyWithParts("396487502")).thenReturn(new WattpadStoryParts(base.story(), "English", List.of(
                new com.subtitlestudio.fanfic.WattpadPart("1", "Prologue", 190, NOW, NOW, false),
                new com.subtitlestudio.fanfic.WattpadPart("2", "One", 1200, NOW, NOW.plusSeconds(60), false),
                new com.subtitlestudio.fanfic.WattpadPart("3", "Gone", 0, NOW, null, true))));

        List<WattpadPreviewPart> parts = service.preview(LINK).parts();

        assertThat(parts).extracting(WattpadPreviewPart::partId).containsExactly("1", "2", "3");
        assertThat(parts).extracting(WattpadPreviewPart::title).containsExactly("Prologue", "One", "Gone");
        assertThat(parts).extracting(WattpadPreviewPart::wordCount).containsExactly(190, 1200, 0);
        assertThat(parts.get(1).modifiedAt()).isEqualTo(NOW.plusSeconds(60));
        assertThat(parts).extracting(WattpadPreviewPart::deleted).containsExactly(false, false, true);
        verify(wattpad, org.mockito.Mockito.times(1)).storyWithParts(anyString());
        verify(wattpad, never()).partText(anyString());
    }

    @Test
    void previewGuessesThaiFromTheLanguageName() {
        when(wattpad.storyWithParts("396487502")).thenReturn(story("Thai"));

        assertThat(service.preview(LINK).sourceLanguage()).isEqualTo("th");
    }

    @Test
    void previewDefaultsToEnglishWhenTheLanguageIsUnknown() {
        when(wattpad.storyWithParts("396487502")).thenReturn(story(null));

        assertThat(service.preview(LINK).sourceLanguage()).isEqualTo("en");
    }

    @Test
    void previewReportsAnExistingNovel() {
        when(wattpad.storyWithParts("396487502")).thenReturn(story("English"));
        Novel existing = new Novel("old", "Old", NovelStatus.ONGOING, Instant.parse("2026-11-01T00:00:00Z"));
        ReflectionTestUtils.setField(existing, "id", 42L);
        when(novels.findByWattpadStoryId("396487502")).thenReturn(Optional.of(existing));

        assertThat(service.preview(LINK).existingNovelId()).isEqualTo(42L);
    }

    @Test
    void previewRejectsAChapterLinkAndAForeignLink() {
        assertThatThrownBy(() -> service.preview("https://www.wattpad.com/1552277732-chapter-one"))
                .isInstanceOf(InvalidFanficLinkException.class).hasMessageContaining("not a chapter link");
        assertThatThrownBy(() -> service.preview("https://example.com/story/1"))
                .isInstanceOf(InvalidFanficLinkException.class);
        assertThatThrownBy(() -> service.preview("")).isInstanceOf(InvalidFanficLinkException.class);
        verify(wattpad, never()).storyWithParts(anyString());
    }

    @Test
    void previewPassesOnNotFoundAndUnavailable() {
        when(wattpad.storyWithParts("396487502")).thenThrow(new FanficNotFoundException());
        assertThatThrownBy(() -> service.preview(LINK)).isInstanceOf(FanficNotFoundException.class);
        org.mockito.Mockito.doThrow(new WattpadUnavailableException("down")).when(wattpad)
                .storyWithParts("396487502");
        assertThatThrownBy(() -> service.preview(LINK)).isInstanceOf(WattpadUnavailableException.class);
    }

    @Test
    void createDownloadsTheCoverAndSavesTheNovelWithIt() {
        when(wattpad.downloadCover(COVER)).thenReturn(new byte[] {1, 2, 3});
        when(mediaService.storeResized(anyString(), any(), anyInt())).thenReturn(media(7));
        NovelDetail created = mock(NovelDetail.class);
        when(novelService.create(any())).thenReturn(created);

        NovelDetail result = service.create(request(COVER, null));

        assertThat(result).isSameAs(created);
        ArgumentCaptor<NovelRequest> sent = ArgumentCaptor.forClass(NovelRequest.class);
        verify(novelService).create(sent.capture());
        assertThat(sent.getValue().coverMediaId()).isEqualTo(7L);
        assertThat(sent.getValue().coverUrl()).isNull();
        assertThat(sent.getValue().wattpadStoryId()).isEqualTo("396487502");
        verify(mediaService).storeResized(eq("wattpad-cover"), eq(new byte[] {1, 2, 3}), eq(512));
    }

    @Test
    void createWithoutACoverUrlDoesNotCallWattpad() {
        service.create(request(null, null));

        verify(wattpad, never()).downloadCover(anyString());
        verify(novelService).create(any());
    }

    @Test
    void aCoverThatCannotBeDownloadedDoesNotBlockTheNovel() {
        when(wattpad.downloadCover(COVER)).thenThrow(new WattpadUnavailableException("down"));

        service.create(request(COVER, null));

        ArgumentCaptor<NovelRequest> sent = ArgumentCaptor.forClass(NovelRequest.class);
        verify(novelService).create(sent.capture());
        assertThat(sent.getValue().coverMediaId()).isNull();
    }

    @Test
    void anUploadedCoverWinsOverTheStoryCover() {
        service.create(request(COVER, 9L));

        verify(wattpad, never()).downloadCover(anyString());
        ArgumentCaptor<NovelRequest> sent = ArgumentCaptor.forClass(NovelRequest.class);
        verify(novelService).create(sent.capture());
        assertThat(sent.getValue().coverMediaId()).isEqualTo(9L);
    }

    @Test
    void aCoverFromAnotherHostIsRejectedBeforeAnyDownload() {
        for (String url : new String[] {"https://evil.example/c.jpg", "http://img.wattpad.com/c.jpg",
                "https://wattpad.com.evil.example/c.jpg", "file:///etc/passwd", "not a url"}) {
            assertThatThrownBy(() -> service.create(request(url, null))).as(url)
                    .isInstanceOf(InvalidNovelException.class);
        }
        verify(wattpad, never()).downloadCover(anyString());
        verify(novelService, never()).create(any());
    }

    @Test
    void aStoryThatAlreadyHasANovelIsRejectedBeforeAnyDownload() {
        Novel existing = new Novel("old", "Old", NovelStatus.ONGOING, Instant.parse("2026-11-01T00:00:00Z"));
        ReflectionTestUtils.setField(existing, "id", 42L);
        when(novels.findByWattpadStoryId("396487502")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.create(request(COVER, null))).isInstanceOf(DuplicateWattpadNovelException.class)
                .satisfies(e -> assertThat(((DuplicateWattpadNovelException) e).novelId()).isEqualTo(42L));
        verify(wattpad, never()).downloadCover(anyString());
        verify(novelService, never()).create(any());
    }

    @Test
    void theStoredCoverIsRemovedWhenTheNovelCannotBeCreated() {
        when(wattpad.downloadCover(COVER)).thenReturn(new byte[] {1});
        when(mediaService.storeResized(anyString(), any(), anyInt())).thenReturn(media(7));
        when(novelService.create(any())).thenThrow(new DuplicateNovelSlugException("the-way-she-warmed-me"));

        assertThatThrownBy(() -> service.create(request(COVER, null))).isInstanceOf(DuplicateNovelSlugException.class);

        verify(mediaService).deleteIfUnreferenced(List.of(7L));
    }

    // ---- parts, import, reload ----

    private Novel wattpadNovel(long id) {
        Novel n = new Novel("warm", "Warm", NovelStatus.COMPLETED, NOW);
        ReflectionTestUtils.setField(n, "id", id);
        n.setSourceType(NovelSourceType.WATTPAD);
        n.setWattpadStoryId("396487502");
        when(novels.findById(id)).thenReturn(Optional.of(n));
        return n;
    }

    private static com.subtitlestudio.fanfic.WattpadPart part(String id, String title, boolean deleted) {
        return new com.subtitlestudio.fanfic.WattpadPart(id, title, 100, NOW, NOW, deleted);
    }

    private void storyParts(com.subtitlestudio.fanfic.WattpadPart... parts) {
        WattpadStoryParts base = story("English");
        when(wattpad.storyWithParts("396487502")).thenReturn(new WattpadStoryParts(base.story(), "English",
                List.of(parts)));
    }

    private static final java.util.List<Object[]> NONE = new java.util.ArrayList<>();

    @Test
    void partsAreListedInStoryOrderWithTheirImportedChapter() {
        wattpadNovel(3);
        storyParts(part("1", "Prologue", false), part("2", "One", false), part("3", "Two", true));
        when(chapters.importedParts(3L)).thenReturn(java.util.Collections.singletonList(new Object[] {"2", 55L}));

        List<WattpadPartRow> rows = service.parts(3);

        assertThat(rows).extracting(WattpadPartRow::partId).containsExactly("1", "2", "3");
        assertThat(rows).extracting(WattpadPartRow::importedChapterId).containsExactly(null, 55L, null);
        assertThat(rows.get(2).deleted()).isTrue();
    }

    @Test
    void partsAndImportNeedAWattpadNovel() {
        Novel plain = new Novel("p", "P", NovelStatus.ONGOING, NOW);
        when(novels.findById(4L)).thenReturn(Optional.of(plain));
        when(novels.findById(9L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.parts(4)).isInstanceOf(com.subtitlestudio.novel.NovelNotWattpadException.class);
        assertThatThrownBy(() -> service.importParts(4, List.of("1")))
                .isInstanceOf(com.subtitlestudio.novel.NovelNotWattpadException.class);
        assertThatThrownBy(() -> service.parts(9)).isInstanceOf(com.subtitlestudio.novel.NovelNotFoundException.class);
        verify(wattpad, never()).storyWithParts(anyString());
    }

    @Test
    void importCreatesChaptersInStoryOrderWhateverTheRequestOrder() {
        wattpadNovel(3);
        storyParts(part("1", "Prologue", false), part("2", "One", false), part("3", "Two", false));
        when(chapters.importedParts(3L)).thenReturn(NONE);
        when(wattpad.partText("1")).thenReturn("<p>Prologue text</p>");
        when(wattpad.partText("3")).thenReturn("<p>Two text</p><p>***</p><p>More</p>");
        when(chapterService.addFromSource(eq(3L), anyString(), anyString(), anyString(), any())).thenReturn(101L, 102L);

        WattpadImportResult r = service.importParts(3, List.of("3", "1"));

        assertThat(r.imported()).extracting(WattpadImportResult.Imported::partId).containsExactly("1", "3");
        assertThat(r.imported()).extracting(WattpadImportResult.Imported::chapterId).containsExactly(101L, 102L);
        assertThat(r.skipped()).isEmpty();
        assertThat(r.failed()).isEmpty();
        org.mockito.InOrder order = org.mockito.Mockito.inOrder(chapterService);
        order.verify(chapterService).addFromSource(3L, "Prologue", "Prologue text", "1", NOW);
        order.verify(chapterService).addFromSource(3L, "Two", "Two text\n\n***\n\nMore", "3", NOW);
        verify(sleeper).sleep(500);
    }

    @Test
    void importSkipsPartsThatAreAlreadyChapters() {
        wattpadNovel(3);
        storyParts(part("1", "Prologue", false), part("2", "One", false));
        when(chapters.importedParts(3L)).thenReturn(java.util.Collections.singletonList(new Object[] {"1", 50L}));
        when(wattpad.partText("2")).thenReturn("<p>One</p>");
        when(chapterService.addFromSource(eq(3L), anyString(), anyString(), anyString(), any())).thenReturn(60L);

        WattpadImportResult r = service.importParts(3, List.of("1", "2"));

        assertThat(r.skipped()).containsExactly("1");
        assertThat(r.imported()).extracting(WattpadImportResult.Imported::partId).containsExactly("2");
        verify(wattpad, never()).partText("1");
        verify(sleeper, never()).sleep(500);
    }

    @Test
    void oneFailingPartDoesNotStopTheOthers() {
        wattpadNovel(3);
        storyParts(part("1", "A", false), part("2", "B", false), part("3", "C", false), part("4", "D", true),
                part("5", "E", false));
        when(chapters.importedParts(3L)).thenReturn(NONE);
        when(wattpad.partText("1")).thenThrow(new WattpadUnavailableException("down"));
        when(wattpad.partText("2")).thenReturn("");
        when(wattpad.partText("3")).thenReturn("<p>C</p>");
        when(wattpad.partText("5")).thenReturn("<p>E</p>");
        when(chapterService.addFromSource(eq(3L), anyString(), anyString(), anyString(), any())).thenReturn(7L, 8L);

        WattpadImportResult r = service.importParts(3, List.of("1", "2", "3", "4", "5", "99"));

        assertThat(r.imported()).extracting(WattpadImportResult.Imported::partId).containsExactly("3", "5");
        assertThat(r.failed()).extracting(WattpadImportResult.Failure::partId)
                .containsExactly("1", "2", "4", "99");
        assertThat(r.failed().get(0).reason()).isEqualTo(WattpadNovelService.DID_NOT_ANSWER);
        assertThat(r.failed().get(1).reason()).isEqualTo(WattpadNovelService.NO_TEXT);
        assertThat(r.failed().get(1).title()).isEqualTo("B");
    }

    @Test
    void aSaveErrorIsReportedPerPart() {
        wattpadNovel(3);
        storyParts(part("1", "A", false), part("2", "B", false));
        when(chapters.importedParts(3L)).thenReturn(NONE);
        when(wattpad.partText(anyString())).thenReturn("<p>x</p>");
        when(chapterService.addFromSource(eq(3L), eq("A"), anyString(), eq("1"), any()))
                .thenThrow(new IllegalStateException("db"));
        when(chapterService.addFromSource(eq(3L), eq("B"), anyString(), eq("2"), any())).thenReturn(9L);

        WattpadImportResult r = service.importParts(3, List.of("1", "2"));

        assertThat(r.imported()).extracting(WattpadImportResult.Imported::partId).containsExactly("2");
        assertThat(r.failed()).extracting(WattpadImportResult.Failure::partId).containsExactly("1");
    }

    @Test
    void reloadReplacesTheOriginalText() {
        when(chapterService.reloadablePartId(5L)).thenReturn("1552");
        when(wattpad.partText("1552")).thenReturn("<p>Fresh</p>");
        com.subtitlestudio.novel.ChapterDetail detail = mock(com.subtitlestudio.novel.ChapterDetail.class);
        when(chapterService.replaceSourceText(5L, "Fresh", NOW)).thenReturn(detail);

        assertThat(service.reloadOriginal(5L)).isSameAs(detail);
    }

    @Test
    void reloadWithNoTextFromWattpadChangesNothing() {
        when(chapterService.reloadablePartId(5L)).thenReturn("1552");
        when(wattpad.partText("1552")).thenReturn("");

        assertThatThrownBy(() -> service.reloadOriginal(5L)).isInstanceOf(WattpadUnavailableException.class);
        verify(chapterService, never()).replaceSourceText(anyLong(), anyString(), any());
    }

    @Test
    void reloadIsRefusedBeforeCallingWattpadWhenTheChapterIsNotReloadable() {
        when(chapterService.reloadablePartId(5L)).thenThrow(new com.subtitlestudio.novel.ChapterPublishedException(5));

        assertThatThrownBy(() -> service.reloadOriginal(5L))
                .isInstanceOf(com.subtitlestudio.novel.ChapterPublishedException.class);
        verify(wattpad, never()).partText(anyString());
    }

    // ---- fetch & translate one part ----

    private com.subtitlestudio.novel.ChapterDetail started = mock(com.subtitlestudio.novel.ChapterDetail.class);

    private com.subtitlestudio.novel.Chapter importedChapter(Novel n, long id,
            com.subtitlestudio.novel.ChapterTranslationStatus status) {
        com.subtitlestudio.novel.Chapter c = new com.subtitlestudio.novel.Chapter(n, 1, "One", NOW);
        ReflectionTestUtils.setField(c, "id", id);
        c.setTranslationStatus(status);
        when(chapters.findByNovelIdAndWattpadPartId(3L, "2")).thenReturn(Optional.of(c));
        return c;
    }

    private void verifyNothingFetchedOrStarted() {
        verify(wattpad, never()).partText(anyString());
        verify(chapterService, never()).addFromSource(anyLong(), anyString(), anyString(), anyString(), any());
        verify(translation, never()).start(anyLong());
    }

    @Test
    void fetchAndTranslateImportsThenStarts() {
        wattpadNovel(3);
        storyParts(part("1", "Prologue", false), part("2", "One", false));
        when(wattpad.partText("2")).thenReturn("<p>Hello</p>");
        when(chapterService.addFromSource(3L, "One", "Hello", "2", NOW)).thenReturn(77L);
        when(translation.start(77L)).thenReturn(started);

        assertThat(service.fetchAndTranslate(3, "2")).isSameAs(started);

        verify(wattpad, org.mockito.Mockito.times(1)).partText("2");
        verify(translation).requireReady(any());
    }

    @Test
    void fetchAndTranslateRefusesWhileAChapterIsTranslating() {
        wattpadNovel(3);
        when(chapters.existsByNovelIdAndTranslationStatus(3L,
                com.subtitlestudio.novel.ChapterTranslationStatus.TRANSLATING)).thenReturn(true);

        assertThatThrownBy(() -> service.fetchAndTranslate(3, "2"))
                .isInstanceOf(com.subtitlestudio.novel.NovelTranslationBusyException.class);
        verifyNothingFetchedOrStarted();
    }

    @Test
    void fetchAndTranslateRefusesWhileNotebookUpdates() {
        Novel n = wattpadNovel(3);
        n.setNotebookStatus(com.subtitlestudio.novel.NotebookStatus.UPDATING);

        assertThatThrownBy(() -> service.fetchAndTranslate(3, "2"))
                .isInstanceOf(com.subtitlestudio.novel.NovelTranslationBusyException.class);
        verifyNothingFetchedOrStarted();
    }

    @Test
    void aFailedNotebookIsNotBusy() {
        Novel n = wattpadNovel(3);
        n.setNotebookStatus(com.subtitlestudio.novel.NotebookStatus.FAILED);
        storyParts(part("2", "One", false));
        when(wattpad.partText("2")).thenReturn("<p>Hello</p>");
        when(chapterService.addFromSource(3L, "One", "Hello", "2", NOW)).thenReturn(77L);
        when(translation.start(77L)).thenReturn(started);

        assertThat(service.fetchAndTranslate(3, "2")).isSameAs(started);
    }

    @Test
    void fetchAndTranslateChecksReadinessBeforeFetching() {
        wattpadNovel(3);
        org.mockito.Mockito.doThrow(new com.subtitlestudio.translate.GeminiNotConfiguredException("x"))
                .when(translation).requireReady(any());

        assertThatThrownBy(() -> service.fetchAndTranslate(3, "2"))
                .isInstanceOf(com.subtitlestudio.translate.GeminiNotConfiguredException.class);
        verifyNothingFetchedOrStarted();
    }

    @Test
    void fetchAndTranslateOnImportedChapterOnlyTranslates() {
        Novel n = wattpadNovel(3);
        for (var status : List.of(com.subtitlestudio.novel.ChapterTranslationStatus.NONE,
                com.subtitlestudio.novel.ChapterTranslationStatus.FAILED)) {
            importedChapter(n, 55, status);
            when(translation.start(55L)).thenReturn(started);

            assertThat(service.fetchAndTranslate(3, "2")).isSameAs(started);
        }

        verify(wattpad, never()).partText(anyString());
        verify(wattpad, never()).storyWithParts(anyString());
        verify(chapterService, never()).addFromSource(anyLong(), anyString(), anyString(), anyString(), any());
    }

    @Test
    void fetchAndTranslateRefusesATranslatedChapter() {
        Novel n = wattpadNovel(3);
        importedChapter(n, 55, com.subtitlestudio.novel.ChapterTranslationStatus.TRANSLATED);

        assertThatThrownBy(() -> service.fetchAndTranslate(3, "2"))
                .isInstanceOf(com.subtitlestudio.novel.ChapterAlreadyTranslatedException.class);
        verifyNothingFetchedOrStarted();
    }

    @Test
    void fetchAndTranslateDeletedOrEmptyOrMissingPart() {
        wattpadNovel(3);
        storyParts(part("2", "One", true), part("3", "Two", false));
        when(wattpad.partText("3")).thenReturn("<p></p>");

        assertThatThrownBy(() -> service.fetchAndTranslate(3, "2"))
                .isInstanceOf(WattpadPartProblemException.class)
                .extracting(e -> ((WattpadPartProblemException) e).code()).isEqualTo("WATTPAD_PART_DELETED");
        assertThatThrownBy(() -> service.fetchAndTranslate(3, "3"))
                .isInstanceOf(WattpadPartProblemException.class)
                .extracting(e -> ((WattpadPartProblemException) e).code()).isEqualTo("WATTPAD_PART_EMPTY");
        assertThatThrownBy(() -> service.fetchAndTranslate(3, "9"))
                .isInstanceOf(WattpadPartProblemException.class)
                .extracting(e -> ((WattpadPartProblemException) e).code()).isEqualTo("WATTPAD_PART_NOT_FOUND");
        verify(chapterService, never()).addFromSource(anyLong(), anyString(), anyString(), anyString(), any());
        verify(translation, never()).start(anyLong());
    }

    @Test
    void fetchAndTranslateKeepsTheChapterWhenStartFails() {
        wattpadNovel(3);
        storyParts(part("2", "One", false));
        when(wattpad.partText("2")).thenReturn("<p>Hello</p>");
        when(chapterService.addFromSource(3L, "One", "Hello", "2", NOW)).thenReturn(77L);
        when(translation.start(77L)).thenThrow(new IllegalStateException("boom"));

        assertThatThrownBy(() -> service.fetchAndTranslate(3, "2")).isInstanceOf(IllegalStateException.class);

        verify(chapterService, org.mockito.Mockito.times(1)).addFromSource(3L, "One", "Hello", "2", NOW);
    }

    // ---- fetch & translate the next part ----

    /** Gives part {@code partId} a chapter with this status (what the Wattpad tab's Next badge looks at). */
    private void chapterFor(Novel n, String partId, long chapterId,
            com.subtitlestudio.novel.ChapterTranslationStatus status) {
        com.subtitlestudio.novel.Chapter c = new com.subtitlestudio.novel.Chapter(n, 1, "T" + partId, NOW);
        ReflectionTestUtils.setField(c, "id", chapterId);
        c.setTranslationStatus(status);
        when(chapters.findByNovelIdAndWattpadPartId(3L, partId)).thenReturn(Optional.of(c));
    }

    @Test
    void nextFetchesTheFirstPartWithoutAChapterAndStartsIt() {
        Novel n = wattpadNovel(3);
        storyParts(part("1", "Prologue", false), part("2", "One", false), part("3", "Two", false));
        chapterFor(n, "1", 51, com.subtitlestudio.novel.ChapterTranslationStatus.TRANSLATED);
        when(wattpad.partText("2")).thenReturn("<p>Hello</p>");
        when(chapterService.addFromSource(3L, "One", "Hello", "2", NOW)).thenReturn(77L);
        when(translation.start(77L)).thenReturn(started);

        assertThat(service.fetchAndTranslateNext(3)).isSameAs(started);

        verify(wattpad, org.mockito.Mockito.times(1)).storyWithParts("396487502");
        verify(wattpad, org.mockito.Mockito.times(1)).partText("2");
        verify(translation).requireReady(any());
    }

    @Test
    void nextPrefersAnEarlierFailedChapterAndDoesNotFetchItsText() {
        Novel n = wattpadNovel(3);
        storyParts(part("1", "Prologue", false), part("2", "One", false), part("3", "Two", false));
        chapterFor(n, "1", 51, com.subtitlestudio.novel.ChapterTranslationStatus.TRANSLATED);
        chapterFor(n, "2", 52, com.subtitlestudio.novel.ChapterTranslationStatus.FAILED);
        when(translation.start(52L)).thenReturn(started);

        assertThat(service.fetchAndTranslateNext(3)).isSameAs(started);

        verify(wattpad, never()).partText(anyString());
        verify(chapterService, never()).addFromSource(anyLong(), anyString(), anyString(), anyString(), any());
        verify(wattpad, org.mockito.Mockito.times(1)).storyWithParts("396487502");
    }

    @Test
    void nextSkipsDeletedPartsAndTranslatedChapters() {
        Novel n = wattpadNovel(3);
        storyParts(part("1", "Gone", true), part("2", "One", false), part("3", "Two", false));
        chapterFor(n, "2", 52, com.subtitlestudio.novel.ChapterTranslationStatus.TRANSLATED);
        when(wattpad.partText("3")).thenReturn("<p>Hi</p>");
        when(chapterService.addFromSource(3L, "Two", "Hi", "3", NOW)).thenReturn(78L);
        when(translation.start(78L)).thenReturn(started);

        assertThat(service.fetchAndTranslateNext(3)).isSameAs(started);

        verify(wattpad, never()).partText("1");
    }

    @Test
    void nextWithNothingLeftIs409AndCreatesNothing() {
        Novel n = wattpadNovel(3);
        storyParts(part("1", "Prologue", false), part("2", "Gone", true));
        chapterFor(n, "1", 51, com.subtitlestudio.novel.ChapterTranslationStatus.TRANSLATED);

        assertThatThrownBy(() -> service.fetchAndTranslateNext(3))
                .isInstanceOf(WattpadNothingNextException.class)
                .hasMessage("Every Wattpad part is already translated.");
        verifyNothingFetchedOrStarted();
    }

    @Test
    void nextWithOnlyDeletedPartsLeftIsNothingNext() {
        wattpadNovel(3);
        storyParts(part("1", "Gone", true));

        assertThatThrownBy(() -> service.fetchAndTranslateNext(3)).isInstanceOf(WattpadNothingNextException.class);
        verifyNothingFetchedOrStarted();
    }

    @Test
    void nextIsRefusedWhileBusyBeforeAnyWattpadCall() {
        wattpadNovel(3);
        when(chapters.existsByNovelIdAndTranslationStatus(3L,
                com.subtitlestudio.novel.ChapterTranslationStatus.TRANSLATING)).thenReturn(true);

        assertThatThrownBy(() -> service.fetchAndTranslateNext(3))
                .isInstanceOf(com.subtitlestudio.novel.NovelTranslationBusyException.class);
        verify(wattpad, never()).storyWithParts(anyString());
        verifyNothingFetchedOrStarted();
    }

    @Test
    void nextChecksReadinessBeforeCallingWattpad() {
        wattpadNovel(3);
        org.mockito.Mockito.doThrow(new com.subtitlestudio.translate.GeminiNotConfiguredException("x"))
                .when(translation).requireReady(any());

        assertThatThrownBy(() -> service.fetchAndTranslateNext(3))
                .isInstanceOf(com.subtitlestudio.translate.GeminiNotConfiguredException.class);
        verify(wattpad, never()).storyWithParts(anyString());
    }

    @Test
    void nextOnANovelThatIsNotFromWattpadIsRefused() {
        Novel n = new Novel("plain", "Plain", NovelStatus.ONGOING, NOW);
        ReflectionTestUtils.setField(n, "id", 4L);
        when(novels.findById(4L)).thenReturn(Optional.of(n));

        assertThatThrownBy(() -> service.fetchAndTranslateNext(4))
                .isInstanceOf(com.subtitlestudio.novel.NovelNotWattpadException.class);
        verify(wattpad, never()).storyWithParts(anyString());
    }

    @Test
    void nextKeepsTheSavedChapterWhenStartFails() {
        wattpadNovel(3);
        storyParts(part("1", "One", false));
        when(wattpad.partText("1")).thenReturn("<p>Hello</p>");
        when(chapterService.addFromSource(3L, "One", "Hello", "1", NOW)).thenReturn(77L);
        when(translation.start(77L)).thenThrow(new IllegalStateException("boom"));

        assertThatThrownBy(() -> service.fetchAndTranslateNext(3)).isInstanceOf(IllegalStateException.class);

        verify(chapterService, org.mockito.Mockito.times(1)).addFromSource(3L, "One", "Hello", "1", NOW);
    }

    // ---- automatic translation profile ----

    private static NovelRequest profileRequest(String title, String profile, String language) {
        return new NovelRequest("my-grumpy-vampire", title, null, "emibonnie", "A blurb", List.of("gl"),
                NovelStatus.COMPLETED, null, LINK, profile, null, NovelSourceType.WATTPAD, language, "396487502",
                null);
    }

    @Test
    void aBlankProfileCreatesOneFromTheTemplateAndUsesIt() {
        service.create(profileRequest("My Grumpy Vampire | EmiBonnie", null, "th"));

        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(profiles, org.mockito.Mockito.times(1)).create(eq("MyGrumpyVampire"), text.capture());
        assertThat(text.getValue()).contains("My Grumpy Vampire | EmiBonnie", "emibonnie", "gl", "A blurb",
                "tiếng Thái");
        ArgumentCaptor<NovelRequest> sent = ArgumentCaptor.forClass(NovelRequest.class);
        verify(novelService).create(sent.capture());
        assertThat(sent.getValue().promptProfile()).isEqualTo("MyGrumpyVampire");
    }

    @Test
    void aChosenProfileWritesNothing() {
        service.create(profileRequest("My Grumpy Vampire", "BeMySugar", "th"));

        verify(profiles, never()).create(anyString(), anyString());
        ArgumentCaptor<NovelRequest> sent = ArgumentCaptor.forClass(NovelRequest.class);
        verify(novelService).create(sent.capture());
        assertThat(sent.getValue().promptProfile()).isEqualTo("BeMySugar");
    }

    @Test
    void theProfileFileIsDeletedAgainWhenTheNovelCannotBeCreated() {
        DuplicateNovelSlugException failure = new DuplicateNovelSlugException("my-grumpy-vampire");
        when(novelService.create(any())).thenThrow(failure);

        assertThatThrownBy(() -> service.create(profileRequest("My Grumpy Vampire", " ", "en"))).isSameAs(failure);

        verify(profiles).delete("MyGrumpyVampire");
    }

    @Test
    void anExistingProfileFileIsNotReusedOrOverwritten() {
        when(profiles.exists("MyGrumpyVampire")).thenReturn(true);

        service.create(profileRequest("My Grumpy Vampire", null, "en"));

        verify(profiles).create(eq("MyGrumpyVampire-2"), anyString());
        verify(profiles, never()).create(eq("MyGrumpyVampire"), anyString());
    }

    @Test
    void thePreviewSuggestsTheProfileName() {
        when(wattpad.storyWithParts("396487502")).thenReturn(story("English"));
        when(profiles.exists("TheWayShe WarmedMe".replace(" ", ""))).thenReturn(true);

        assertThat(service.preview(LINK).suggestedProfile()).isEqualTo("TheWaySheWarmedMe-2");
    }
}
