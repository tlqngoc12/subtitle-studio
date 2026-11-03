package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.subtitle.CaptionNormalizer;
import com.subtitlestudio.subtitle.Cue;
import com.subtitlestudio.subtitle.NoEnglishSubtitleException;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SrtWriter;
import com.subtitlestudio.subtitle.SubtitleTrack;
import com.subtitlestudio.subtitle.SubtitleTrackSelector;
import com.subtitlestudio.subtitle.VttParser;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.url.InvalidUrlException;
import com.subtitlestudio.url.UrlParser;
import com.subtitlestudio.ytdlp.VideoInfo;
import com.subtitlestudio.ytdlp.YtDlpClient;
import com.subtitlestudio.ytdlp.YtDlpFailedException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Real parser/normalizer/JPA; only yt-dlp is faked (it copies fixture .vtt files into the subs dir). */
@DataJpaTest
// Keep the configured H2 URL (MODE=Oracle) instead of Spring's plain embedded H2.
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({SubtitleService.class, UrlParser.class, SubtitleTrackSelector.class, VttParser.class,
        CaptionNormalizer.class, SrtWriter.class, SubtitleFileStore.class, SubtitleServiceTest.Config.class})
class SubtitleServiceTest {

    private static final String ID = "dQw4w9WgXcQ";
    private static final Path DATA_DIR = createTempDir();
    private static final Path SUBS_DIR = DATA_DIR.resolve("subs");

    private static final VideoInfo AUTO_INFO =
            new VideoInfo(ID, "Auto title", "Auto channel", 754, Set.of("fr"), Set.of("en-orig", "en"));
    private static final VideoInfo MANUAL_INFO =
            new VideoInfo(ID, "Manual title", "Manual channel", 800, Set.of("en"), Set.of("en-orig"));
    private static final VideoInfo NO_ENGLISH_INFO =
            new VideoInfo(ID, "Tiếng Việt", "Kênh", 100, Set.of("vi"), Set.of("vi-orig"));

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    @TestConfiguration
    @EnableConfigurationProperties(SubtitleStudioProperties.class)
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(Instant.parse("2026-11-02T10:00:00Z"));
        }
    }

    @MockitoBean
    private YtDlpClient ytDlp;

    @Autowired
    private SubtitleService service;

    @Autowired
    private VideoRepository videos;

    @Autowired
    private CueRepository cues;

    @Autowired
    private ViCueRepository viCues;

    @Autowired
    private MutableClock clock;

    @Autowired
    private TestEntityManager em;

    @Autowired
    private SrtWriter srtWriter;

    @BeforeEach
    void fakeDownloads() {
        clock.reset(); // the context (and this bean) is cached across tests
        // auto tracks get the rolling fixture, manual tracks the manual fixture
        when(ytDlp.downloadVtt(anyString(), any(), any())).thenAnswer(inv -> {
            String id = inv.getArgument(0);
            SubtitleTrack track = inv.getArgument(1);
            Path outDir = inv.getArgument(2);
            Files.createDirectories(outDir);
            Path target = outDir.resolve(id + "." + track.lang() + ".vtt");
            String fixture = track.source() == SourceType.AUTO ? "vtt/auto-rolling.vtt" : "vtt/manual.vtt";
            try (InputStream in = getClass().getClassLoader().getResourceAsStream(fixture)) {
                Files.write(target, in.readAllBytes());
            }
            return target;
        });
    }

    // --- fetch ---

    @Test
    void fetchImportsNewVideoAndStoresNormalizedCues() {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO);

        FetchResult result = service.fetch("https://youtu.be/" + ID);

        assertThat(result.created()).isTrue();
        Video video = result.video();
        assertThat(video.getId()).isEqualTo(ID);
        assertThat(video.getTitle()).isEqualTo("Auto title");
        assertThat(video.getChannel()).isEqualTo("Auto channel");
        assertThat(video.getDurationSec()).isEqualTo(754);
        assertThat(video.getSubLang()).isEqualTo("en-orig");
        assertThat(video.getSubSource()).isEqualTo(SourceType.AUTO);
        assertThat(video.getCueCount()).isEqualTo(2);
        assertThat(video.getFetchedAt()).isEqualTo(Instant.parse("2026-11-02T10:00:00Z"));

        em.flush();
        em.clear();
        assertThat(service.getCues(ID)).containsExactly(
                new Cue(1_000, 6_010, "so today we're going to talk about dependency injection in spring"),
                new Cue(6_010, 8_500, "and why it matters"));
    }

    @Test
    void fetchKeepsVttFileInSubsDir() {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO);

        service.fetch(ID);

        verify(ytDlp).downloadVtt(ID, new SubtitleTrack("en-orig", SourceType.AUTO), SUBS_DIR);
        assertThat(SUBS_DIR.resolve(ID + ".en-orig.vtt")).isRegularFile();
    }

    @Test
    void manualTrackIsStoredWithoutMerging() {
        when(ytDlp.fetchInfo(ID)).thenReturn(MANUAL_INFO);

        Video video = service.fetch(ID).video();

        assertThat(video.getSubSource()).isEqualTo(SourceType.MANUAL);
        assertThat(video.getSubLang()).isEqualTo("en");
        assertThat(video.getCueCount()).isEqualTo(3);
    }

    @Test
    void fetchReturnsCachedVideoWithoutCallingYtDlpAgain() {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO);
        service.fetch("https://www.youtube.com/watch?v=" + ID);

        FetchResult second = service.fetch("https://youtube.com/shorts/" + ID);

        assertThat(second.created()).isFalse();
        assertThat(second.video().getId()).isEqualTo(ID);
        verify(ytDlp, times(1)).fetchInfo(ID);
        verify(ytDlp, times(1)).downloadVtt(anyString(), any(), any());
    }

    @Test
    void invalidUrlFailsBeforeCallingYtDlp() {
        assertThatThrownBy(() -> service.fetch("https://evil.com/watch?v=" + ID))
                .isInstanceOf(InvalidUrlException.class);

        verify(ytDlp, never()).fetchInfo(anyString());
    }

    @Test
    void noEnglishSubtitleSavesNothing() {
        when(ytDlp.fetchInfo(ID)).thenReturn(NO_ENGLISH_INFO);

        assertThatThrownBy(() -> service.fetch(ID)).isInstanceOf(NoEnglishSubtitleException.class);

        assertThat(videos.count()).isZero();
        verify(ytDlp, never()).downloadVtt(anyString(), any(), any());
    }

    @Test
    void machineTranslatedEnglishIsReportedAsNoEnglishWithoutDownloading() {
        // YouTube lists "en" as a translation of the Thai original; downloading it ends in HTTP 429.
        when(ytDlp.fetchInfo(ID)).thenReturn(
                new VideoInfo(ID, "Thai vlog", "GMMTV", 512, Set.of("zh-Hant"), Set.of("th-orig", "th", "en", "vi")));

        assertThatThrownBy(() -> service.fetch(ID)).isInstanceOf(NoEnglishSubtitleException.class);

        verify(ytDlp, never()).downloadVtt(anyString(), any(), any());
    }

    @Test
    void ytDlpFailureSavesNothing() {
        when(ytDlp.fetchInfo(ID)).thenThrow(new YtDlpFailedException("boom"));

        assertThatThrownBy(() -> service.fetch(ID)).isInstanceOf(YtDlpFailedException.class);

        assertThat(videos.count()).isZero();
    }

    // --- read ---

    @Test
    void listsVideosNewestFirst() {
        when(ytDlp.fetchInfo(anyString())).thenAnswer(inv -> withId(AUTO_INFO, inv.getArgument(0)));
        service.fetch("OLD00000001");
        clock.advance(Duration.ofMinutes(5));
        service.fetch("NEW00000001");

        assertThat(service.list()).extracting(Video::getId).containsExactly("NEW00000001", "OLD00000001");
    }

    @Test
    void getUnknownVideoThrowsNotFound() {
        assertThatThrownBy(() -> service.get(ID)).isInstanceOf(VideoNotFoundException.class);
        assertThatThrownBy(() -> service.getCues(ID)).isInstanceOf(VideoNotFoundException.class);
    }

    // --- refresh ---

    @Test
    void refreshReplacesCuesAndMetadata() {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO, MANUAL_INFO);
        service.fetch(ID);
        clock.advance(Duration.ofHours(1));

        Video refreshed = service.refresh(ID);
        em.flush();
        em.clear();

        assertThat(refreshed.getTitle()).isEqualTo("Manual title");
        assertThat(refreshed.getSubSource()).isEqualTo(SourceType.MANUAL);
        assertThat(refreshed.getCueCount()).isEqualTo(3);
        assertThat(refreshed.getFetchedAt()).isEqualTo(Instant.parse("2026-11-02T11:00:00Z"));
        assertThat(service.getCues(ID)).extracting(Cue::text)
                .containsExactly("Welcome back to the channel.",
                        "Today we're talking about\ndependency injection in Spring.",
                        "No identifier on this one.");
        assertThat(videos.count()).isEqualTo(1);
    }

    @Test
    void refreshDeletesOldVttWhenLanguageChanges() {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO, MANUAL_INFO);
        service.fetch(ID);

        service.refresh(ID);

        assertThat(SUBS_DIR.resolve(ID + ".en-orig.vtt")).doesNotExist();
        assertThat(SUBS_DIR.resolve(ID + ".en.vtt")).isRegularFile();
    }

    @Test
    void refreshFailureKeepsExistingData() {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO).thenThrow(new YtDlpFailedException("boom"));
        service.fetch(ID);

        assertThatThrownBy(() -> service.refresh(ID)).isInstanceOf(YtDlpFailedException.class);

        em.flush();
        em.clear();
        assertThat(service.get(ID).getTitle()).isEqualTo("Auto title");
        assertThat(service.getCues(ID)).hasSize(2);
    }

    @Test
    void refreshUnknownVideoThrowsNotFound() {
        assertThatThrownBy(() -> service.refresh(ID)).isInstanceOf(VideoNotFoundException.class);

        verify(ytDlp, never()).fetchInfo(anyString());
    }

    // --- .srt files ---

    @Test
    void fetchWritesEnglishSrt() throws IOException {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO);

        service.fetch("https://youtu.be/" + ID);

        assertThat(Files.readAllBytes(SUBS_DIR.resolve(ID + ".en.srt")))
                .isEqualTo(srtWriter.toBytes(service.getCues(ID), false));
    }

    @Test
    void refreshRewritesEnglishSrt() throws IOException {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO);
        service.fetch("https://youtu.be/" + ID);
        when(ytDlp.fetchInfo(ID)).thenReturn(MANUAL_INFO);

        service.refresh(ID);

        assertThat(Files.readAllBytes(SUBS_DIR.resolve(ID + ".en.srt")))
                .isEqualTo(srtWriter.toBytes(service.getCues(ID), false));
    }

    @Test
    void deleteRemovesAllSubtitleFiles() throws IOException {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO);
        service.fetch("https://youtu.be/" + ID);
        Files.writeString(SUBS_DIR.resolve(ID + ".vi_auto.srt"), "auto");
        Files.writeString(SUBS_DIR.resolve(ID + ".vi_manual.srt"), "manual");

        service.delete(ID);

        try (var files = Files.list(SUBS_DIR)) {
            assertThat(files.map(f -> f.getFileName().toString())).noneMatch(n -> n.startsWith(ID));
        }
    }

    // --- delete ---

    @Test
    void deleteRemovesVideoCuesAndVttFile() {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO);
        service.fetch(ID);
        em.flush();
        assertThat(videos.existsById(ID)).isTrue();
        assertThat(cues.findByVideo_IdOrderByIdxAsc(ID)).isNotEmpty();
        assertThat(SUBS_DIR.resolve(ID + ".en-orig.vtt")).isRegularFile();

        service.delete(ID);
        em.flush();

        assertThat(videos.existsById(ID)).isFalse();
        assertThat(cues.findByVideo_IdOrderByIdxAsc(ID)).isEmpty();
        assertThat(SUBS_DIR.resolve(ID + ".en-orig.vtt")).doesNotExist();
    }

    @Test
    void deleteVideoAlsoDeletesVietsub() {
        when(ytDlp.fetchInfo(ID)).thenReturn(AUTO_INFO);
        Video video = service.fetch(ID).video();
        viCues.save(new ViCueEntity(video, 0, 1_000, 2_000, "Xin chào"));
        em.flush();

        service.delete(ID);
        em.flush();

        assertThat(videos.existsById(ID)).isFalse();
        assertThat(viCues.findByVideo_IdOrderByIdxAsc(ID)).isEmpty();
    }

    @Test
    void deleteUnknownVideoThrowsNotFound() {
        assertThatThrownBy(() -> service.delete(ID)).isInstanceOf(VideoNotFoundException.class);
    }

    // --- helpers ---

    private static VideoInfo withId(VideoInfo base, String id) {
        return new VideoInfo(id, base.title(), base.channel(), base.durationSec(),
                base.subtitleLangs(), base.autoCaptionLangs());
    }

    private static Path createTempDir() {
        try {
            return Files.createTempDirectory("subtitle-studio-test");
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
