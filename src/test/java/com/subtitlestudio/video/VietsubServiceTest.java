package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.subtitlestudio.subtitle.InvalidSrtException;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.url.InvalidUrlException;
import com.subtitlestudio.url.UrlParser;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@DataJpaTest
@ActiveProfiles("test")
@Import({VietsubService.class, SrtParser.class, UrlParser.class, VietsubServiceTest.Config.class})
class VietsubServiceTest {

    private static final String ID = "dQw4w9WgXcQ";
    private static final String URL = "https://youtu.be/" + ID;
    private static final Instant NOW = Instant.parse("2026-11-02T10:00:00Z");

    @TestConfiguration
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }
    }

    @MockitoBean
    private SubtitleService subtitleService;

    @Autowired
    private VietsubService service;

    @Autowired
    private VideoRepository videos;

    @Autowired
    private MutableClock clock;

    @Autowired
    private TestEntityManager em;

    @BeforeEach
    void setUp() {
        clock.reset();
    }

    private Video saveVideo(String id) {
        Video v = new Video(id);
        v.update("Title " + id, "Channel", 60, "en", SourceType.MANUAL, 1, NOW);
        return videos.saveAndFlush(v);
    }

    private static byte[] srt(String... blocks) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < blocks.length; i++) {
            sb.append(i + 1).append('\n').append(blocks[i]).append("\n\n");
        }
        return sb.toString().getBytes(StandardCharsets.UTF_8);
    }

    private void reload() {
        em.flush();
        em.clear();
    }

    @Test
    void addStoresCuesForExistingVideo() {
        saveVideo(ID);

        Video video = service.add(URL, srt("00:00:01,000 --> 00:00:02,000\nXin chào", "00:00:03,000 --> 00:00:04,000\nTạm biệt"));
        reload();

        assertThat(service.getCues(ID)).containsExactly(
                new ViCue(1_000, 2_000, "Xin chào"),
                new ViCue(3_000, 4_000, "Tạm biệt"));
        assertThat(video.getViCueCount()).isEqualTo(2);
        assertThat(videos.findById(ID).orElseThrow().getViCueCount()).isEqualTo(2);
        assertThat(videos.findById(ID).orElseThrow().getViUpdatedAt()).isEqualTo(NOW);
        verify(subtitleService, never()).fetch(any());
    }

    @Test
    void addFetchesVideoWhenMissing() {
        when(subtitleService.fetch(URL)).thenAnswer(inv -> new FetchResult(saveVideo(ID), true));

        service.add(URL, srt("00:00:01,000 --> 00:00:02,000\nXin chào"));
        reload();

        verify(subtitleService, times(1)).fetch(URL);
        assertThat(service.getCues(ID)).containsExactly(new ViCue(1_000, 2_000, "Xin chào"));
    }

    @Test
    void addReplacesPreviousVietsub() {
        saveVideo(ID);
        service.add(URL, srt("00:00:01,000 --> 00:00:02,000\nmột", "00:00:03,000 --> 00:00:04,000\nhai"));
        reload();

        service.add(ID, srt("00:00:05,000 --> 00:00:06,000\nba"));
        reload();

        assertThat(service.getCues(ID)).containsExactly(new ViCue(5_000, 6_000, "ba"));
        assertThat(videos.findById(ID).orElseThrow().getViCueCount()).isEqualTo(1);
    }

    @Test
    void invalidSrtFailsBeforeAnyNetworkCall() {
        assertThatThrownBy(() -> service.add(URL, "garbage".getBytes(StandardCharsets.UTF_8)))
                .isInstanceOf(InvalidSrtException.class);

        verify(subtitleService, never()).fetch(any());
        assertThat(videos.count()).isZero();
    }

    @Test
    void invalidUrlFailsFast() {
        assertThatThrownBy(() -> service.add("https://evil.com/x", srt("00:00:01,000 --> 00:00:02,000\na")))
                .isInstanceOf(InvalidUrlException.class);

        verify(subtitleService, never()).fetch(any());
    }

    @Test
    void sortsCuesByStartTime() {
        saveVideo(ID);

        service.add(URL, srt("00:00:03,000 --> 00:00:04,000\nsau", "00:00:01,000 --> 00:00:02,000\ntrước"));
        reload();

        assertThat(service.getCues(ID)).extracting(ViCue::text).containsExactly("trước", "sau");
    }

    @Test
    void dropsCuesWithoutTextOrWithInvalidTiming() {
        saveVideo(ID);

        service.add(URL, srt(
                "00:00:01,000 --> 00:00:02,000\ngiữ",
                "00:00:03,000 --> 00:00:03,000\nend bằng start",
                "00:00:05,000 --> 00:00:04,000\nend trước start",
                "00:00:06,000 --> 00:00:07,000\n   "));
        reload();

        assertThat(service.getCues(ID)).extracting(ViCue::text).containsExactly("giữ");
    }

    @Test
    void rejectsCueLongerThan1000Chars() {
        saveVideo(ID);

        assertThatThrownBy(() -> service.add(URL, srt("00:00:01,000 --> 00:00:02,000\n" + "a".repeat(1001))))
                .isInstanceOf(InvalidSrtException.class)
                .hasMessageContaining("1000");

        service.add(URL, srt("00:00:01,000 --> 00:00:02,000\n" + "a".repeat(1000)));
        reload();
        assertThat(service.getCues(ID)).hasSize(1);
    }

    @Test
    void rejectsFileWhoseCuesAreAllDropped() {
        saveVideo(ID);

        assertThatThrownBy(() -> service.add(URL, srt("00:00:02,000 --> 00:00:01,000\nsai")))
                .isInstanceOf(InvalidSrtException.class);
    }

    @Test
    void storesTextAsNfc() {
        saveVideo(ID);
        String nfd = Normalizer.normalize("Học", Normalizer.Form.NFD);

        service.add(URL, srt("00:00:01,000 --> 00:00:02,000\n" + nfd));
        reload();

        assertThat(service.getCues(ID).get(0).text()).isEqualTo("Học").isNotEqualTo(nfd);
    }

    @Test
    void clearRemovesVietsub() {
        saveVideo(ID);
        service.add(URL, srt("00:00:01,000 --> 00:00:02,000\nXin chào"));
        reload();

        service.clear(ID);
        reload();

        Video video = videos.findById(ID).orElseThrow();
        assertThat(video.getViCueCount()).isZero();
        assertThat(video.getViUpdatedAt()).isNull();
        assertThat(service.getCues(ID)).isEmpty();
    }

    @Test
    void unknownVideoThrowsNotFound() {
        assertThatThrownBy(() -> service.clear(ID)).isInstanceOf(VideoNotFoundException.class);
        assertThatThrownBy(() -> service.getCues(ID)).isInstanceOf(VideoNotFoundException.class);
    }

    @Test
    void getCuesIsEmptyWhenNoVietsub() {
        saveVideo(ID);

        assertThat(service.getCues(ID)).isEmpty();
    }
}
