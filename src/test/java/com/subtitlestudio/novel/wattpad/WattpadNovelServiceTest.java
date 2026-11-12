package com.subtitlestudio.novel.wattpad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
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

    @BeforeEach
    void setUp() {
        wattpad = mock(WattpadClient.class);
        novels = mock(NovelRepository.class);
        novelService = mock(NovelService.class);
        mediaService = mock(MediaService.class);
        service = new WattpadNovelService(wattpad, novels, novelService, mediaService);
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
}
