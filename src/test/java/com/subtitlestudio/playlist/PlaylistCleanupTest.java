package com.subtitlestudio.playlist;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.subtitle.CaptionNormalizer;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.subtitle.SrtWriter;
import com.subtitlestudio.subtitle.SubtitleTrackSelector;
import com.subtitlestudio.url.UrlParser;
import com.subtitlestudio.subtitle.VttParser;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.video.SubtitleFileStore;
import com.subtitlestudio.video.SubtitleService;
import com.subtitlestudio.video.ViSource;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoDto;
import com.subtitlestudio.video.VideoRepository;
import com.subtitlestudio.video.VietsubService;
import com.subtitlestudio.ytdlp.YtDlpClient;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** Deleting a video's Vietsub, or the video itself, takes it out of every playlist (spec section 3, rules 4-5). */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({PlaylistService.class, VietsubService.class, SubtitleService.class, UrlParser.class,
        SubtitleTrackSelector.class, VttParser.class, CaptionNormalizer.class, SrtParser.class, SrtWriter.class,
        SubtitleFileStore.class, PlaylistCleanupTest.Config.class})
class PlaylistCleanupTest {

    private static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");
    private static final Path DATA_DIR = createTempDir();

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    private static Path createTempDir() {
        try {
            return Files.createTempDirectory("playlist-cleanup-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @TestConfiguration
    @EnableConfigurationProperties(SubtitleStudioProperties.class)
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }
    }

    @MockitoBean
    private YtDlpClient ytDlp;

    @Autowired
    private PlaylistService playlists;

    @Autowired
    private VietsubService vietsub;

    @Autowired
    private SubtitleService subtitles;

    @Autowired
    private VideoRepository videos;

    @Test
    void clearingVietsubRemovesVideoFromPlaylists() {
        long id = playlists.create("P", null).id();
        playlists.addVideo(id, vietsubVideo("aaaaaaaaaaa").getId());
        playlists.addVideo(id, vietsubVideo("bbbbbbbbbbb").getId());

        vietsub.clear("aaaaaaaaaaa");

        assertThat(playlists.get(id).videos()).extracting(VideoDto::id).containsExactly("bbbbbbbbbbb");
    }

    @Test
    void deletingVideoRemovesItFromPlaylistsWithoutFkError() {
        long id = playlists.create("P", null).id();
        playlists.addVideo(id, vietsubVideo("aaaaaaaaaaa").getId());

        subtitles.delete("aaaaaaaaaaa");

        assertThat(videos.findById("aaaaaaaaaaa")).isEmpty();
        assertThat(playlists.get(id).videos()).isEmpty();
    }

    private Video vietsubVideo(String id) {
        Video v = new Video(id);
        v.update("Title " + id, "Channel", 60, "en", SourceType.MANUAL, 1, NOW);
        v.updateVietsub(3, NOW, ViSource.MANUAL);
        return videos.saveAndFlush(v);
    }
}
