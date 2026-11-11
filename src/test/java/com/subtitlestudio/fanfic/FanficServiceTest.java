package com.subtitlestudio.fanfic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.subtitlestudio.profile.MediaRepository;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Real database and media store, mocked Wattpad: the real Wattpad is never called. */
@SpringBootTest
@ActiveProfiles("test")
class FanficServiceTest {

    private static final Path DATA_DIR;
    private static final String COVER_1 = "https://img.wattpad.com/cover/1-256-k1.jpg";

    static {
        try {
            DATA_DIR = Files.createTempDirectory("subtitle-studio-fanfic-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    @Autowired
    private FanficService service;

    @Autowired
    private FanficRepository fanfics;

    @Autowired
    private MediaRepository media;

    @MockitoBean
    private WattpadClient wattpad;

    @MockitoBean
    private Sleeper sleeper;

    @BeforeEach
    void coverBytes() {
        when(wattpad.downloadCover(anyString())).thenReturn(png());
    }

    @AfterEach
    void cleanUp() {
        fanfics.deleteAll();
        media.deleteAll();
    }

    private static byte[] png() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(new BufferedImage(300, 450, BufferedImage.TYPE_INT_RGB), "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    private static WattpadStory story(String id, String title, long reads, String cover) {
        return new WattpadStory(id, title, "emibonnie", "Line one\n\nLine two 𝙉𝙤𝙭 💕", List.of("gl", "fluff"), cover, reads,
                2167, 28, 15739, true, Instant.parse("2026-11-07T12:15:30Z"));
    }

    @Test
    void previewDoesNotSaveAndKeepsWattpadCoverUrl() {
        when(wattpad.fetch("396487502")).thenReturn(story("396487502", "Warm", 51029, COVER_1));

        FanficDto dto = service.preview("https://m.wattpad.com/story/396487502-x?utm_source=ios");

        assertThat(dto.id()).isNull();
        assertThat(dto.title()).isEqualTo("Warm");
        assertThat(dto.coverUrl()).isEqualTo(COVER_1);
        assertThat(dto.url()).isEqualTo("https://www.wattpad.com/story/396487502");
        assertThat(dto.readingMinutes()).isEqualTo(68);
        assertThat(dto.tags()).containsExactly("gl", "fluff");
        assertThat(fanfics.count()).isZero();
        verify(wattpad, never()).downloadCover(anyString());
    }

    @Test
    void addStoresTheCoverResizedTo512AndSaves() {
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm", 10, COVER_1));

        FanficDto dto = service.add("https://www.wattpad.com/story/1-warm");

        assertThat(dto.id()).isNotNull();
        assertThat(dto.coverUrl()).startsWith("/api/media/");
        assertThat(dto.description()).isEqualTo("Line one\n\nLine two 𝙉𝙤𝙭 💕");
        assertThat(dto.completed()).isTrue();
        assertThat(dto.createdAt()).isNotNull();
        assertThat(dto.fetchedAt()).isNotNull();
        assertThat(media.count()).isEqualTo(1);
        assertThat(media.findAll().get(0).getWidth()).isEqualTo(300);
        assertThat(service.list()).hasSize(1);
        assertThat(fanfics.findByWattpadId("1").orElseThrow().getCoverSourceUrl()).isEqualTo(COVER_1);
    }

    @Test
    void addWithoutCoverSavesWithoutImage() {
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm", 10, null));

        FanficDto dto = service.add("https://www.wattpad.com/story/1");

        assertThat(dto.coverUrl()).isNull();
        verify(wattpad, never()).downloadCover(anyString());
    }

    @Test
    void aFailedCoverDownloadDoesNotBlockTheStory() {
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm", 10, COVER_1));
        when(wattpad.downloadCover(anyString())).thenThrow(new WattpadUnavailableException("cover"));

        FanficDto dto = service.add("https://www.wattpad.com/story/1");

        assertThat(dto.coverUrl()).isNull();
        assertThat(fanfics.findByWattpadId("1").orElseThrow().getCoverSourceUrl()).isNull();
    }

    @Test
    void sameStoryInAnotherLinkFormIsDuplicateWithoutCallingWattpad() {
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm", 10, COVER_1));
        service.add("https://www.wattpad.com/story/1-warm");

        assertThatThrownBy(() -> service.add("https://m.wattpad.com/story/1-renamed?utm_source=x"))
                .isInstanceOf(FanficExistsException.class)
                .satisfies(e -> assertThat(((FanficExistsException) e).title()).isEqualTo("Warm"));
        assertThatThrownBy(() -> service.preview("https://wattpad.com/story/1"))
                .isInstanceOf(FanficExistsException.class);
        verify(wattpad, times(1)).fetch("1");
        assertThat(fanfics.count()).isEqualTo(1);
    }

    @Test
    void chapterLinkAndOtherTextAreInvalid() {
        assertThatThrownBy(() -> service.preview("https://www.wattpad.com/1550000000-chapter"))
                .isInstanceOf(InvalidFanficLinkException.class)
                .hasMessage("Use the story link (wattpad.com/story/…), not a chapter link.");
        assertThatThrownBy(() -> service.add("hello")).isInstanceOf(InvalidFanficLinkException.class);
        assertThatThrownBy(() -> service.add(null)).isInstanceOf(InvalidFanficLinkException.class);
        verifyNoInteractions(wattpad);
    }

    @Test
    void wattpadFailuresSaveNothing() {
        when(wattpad.fetch("1")).thenThrow(new WattpadUnavailableException("403"));
        when(wattpad.fetch("2")).thenThrow(new FanficNotFoundException());

        assertThatThrownBy(() -> service.add("https://www.wattpad.com/story/1"))
                .isInstanceOf(WattpadUnavailableException.class);
        assertThatThrownBy(() -> service.add("https://www.wattpad.com/story/2"))
                .isInstanceOf(FanficNotFoundException.class);
        assertThat(fanfics.count()).isZero();
        assertThat(media.count()).isZero();
    }

    @Test
    void listIsNewestStoryUpdateFirst() {
        when(wattpad.fetch("1")).thenReturn(new WattpadStory("1", "Old", "a", null, List.of(), null, 1, 1, 1, 0, false,
                Instant.parse("2026-01-01T00:00:00Z")));
        when(wattpad.fetch("2")).thenReturn(story("2", "New", 5, null));
        service.add("https://www.wattpad.com/story/1");
        service.add("https://www.wattpad.com/story/2");

        assertThat(service.list()).extracting(FanficDto::title).containsExactly("New", "Old");
        assertThat(service.list().get(1).readingMinutes()).isZero();
    }

    @Test
    void refreshUpdatesStatsAndKeepsCoverWhenUrlUnchanged() {
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm", 10, COVER_1));
        FanficDto added = service.add("https://www.wattpad.com/story/1");
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm (new title)", 99, COVER_1));

        FanficDto refreshed = service.refresh(added.id());

        assertThat(refreshed.readCount()).isEqualTo(99);
        assertThat(refreshed.title()).isEqualTo("Warm (new title)");
        assertThat(refreshed.coverUrl()).isEqualTo(added.coverUrl());
        // The database keeps microseconds, the clock nanoseconds.
        assertThat(refreshed.createdAt().toEpochMilli()).isEqualTo(added.createdAt().toEpochMilli());
        verify(wattpad, times(1)).downloadCover(anyString());
        assertThat(media.count()).isEqualTo(1);
    }

    @Test
    void refreshReplacesTheCoverWhenWattpadChangedIt() {
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm", 10, COVER_1));
        FanficDto added = service.add("https://www.wattpad.com/story/1");
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm", 10, "https://img.wattpad.com/cover/1-256-k2.jpg"));

        FanficDto refreshed = service.refresh(added.id());

        assertThat(refreshed.coverUrl()).isNotEqualTo(added.coverUrl());
        verify(wattpad, times(2)).downloadCover(anyString());
        assertThat(media.count()).as("the old cover is cleaned up").isEqualTo(1);
    }

    @Test
    void refreshOfAMissingStoryKeepsTheOldData() {
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm", 10, COVER_1));
        FanficDto added = service.add("https://www.wattpad.com/story/1");
        when(wattpad.fetch("1")).thenThrow(new FanficNotFoundException());

        assertThatThrownBy(() -> service.refresh(added.id())).isInstanceOf(FanficNotFoundException.class);

        assertThat(service.list().get(0).readCount()).isEqualTo(10);
    }

    @Test
    void refreshAllContinuesAfterOneFailureAndPausesBetweenStories() {
        when(wattpad.fetch("1")).thenReturn(story("1", "One", 1, null));
        when(wattpad.fetch("2")).thenReturn(story("2", "Two", 1, null));
        when(wattpad.fetch("3")).thenReturn(story("3", "Three", 1, null));
        service.add("https://www.wattpad.com/story/1");
        FanficDto two = service.add("https://www.wattpad.com/story/2");
        service.add("https://www.wattpad.com/story/3");
        when(wattpad.fetch("1")).thenReturn(story("1", "One", 100, null));
        when(wattpad.fetch("2")).thenThrow(new FanficNotFoundException());
        when(wattpad.fetch("3")).thenReturn(story("3", "Three", 300, null));

        RefreshAllResult result = service.refreshAll();

        assertThat(result.updated()).isEqualTo(2);
        assertThat(result.failed()).hasSize(1);
        assertThat(result.failed().get(0).id()).isEqualTo(two.id());
        assertThat(result.failed().get(0).title()).isEqualTo("Two");
        assertThat(result.failed().get(0).message()).isEqualTo("Story not found or not public.");
        assertThat(service.list()).extracting(FanficDto::readCount).containsExactlyInAnyOrder(100L, 1L, 300L);
        verify(sleeper, times(2)).sleep(500);
    }

    @Test
    void refreshAllReportsWattpadOutagePerStory() {
        when(wattpad.fetch("1")).thenReturn(story("1", "One", 1, null));
        service.add("https://www.wattpad.com/story/1");
        when(wattpad.fetch("1")).thenThrow(new WattpadUnavailableException("429"));

        RefreshAllResult result = service.refreshAll();

        assertThat(result.updated()).isZero();
        assertThat(result.failed().get(0).message()).isEqualTo("Wattpad did not answer. Try again later.");
    }

    @Test
    void deleteRemovesTheStoryAndItsCover() {
        when(wattpad.fetch("1")).thenReturn(story("1", "Warm", 10, COVER_1));
        FanficDto added = service.add("https://www.wattpad.com/story/1");

        service.delete(added.id());

        assertThat(fanfics.count()).isZero();
        assertThat(media.count()).isZero();
        assertThatThrownBy(() -> service.delete(added.id())).isInstanceOf(FanficNotFoundException.class);
    }
}
