package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.playlist.PlaylistService;
import com.subtitlestudio.profile.BlockRequest;
import com.subtitlestudio.profile.BlockType;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.video.ViCue;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoRepository;
import com.subtitlestudio.video.VietsubService;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class SiteExporterTest {

    private static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");
    private static final Path DATA_DIR;
    /** A 1x1 PNG; MediaService checks magic bytes. */
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n', 0, 0, 0, 0};

    static {
        try {
            DATA_DIR = Files.createTempDirectory("subtitle-studio-export-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock(NOW);
        }
    }

    @Autowired
    private SiteExporter exporter;

    @Autowired
    private VideoRepository videos;

    @Autowired
    private VietsubService vietsub;

    @Autowired
    private PlaylistService playlists;

    @Autowired
    private com.subtitlestudio.profile.ProfileService profiles;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private MutableClock clock;

    @Autowired
    private JdbcTemplate jdbc;

    private final ObjectMapper json = new ObjectMapper();

    @TempDir
    Path out;

    @BeforeEach
    void setUp() {
        clock.reset();
    }

    @AfterEach
    void cleanUp() {
        for (String table : List.of("t_playlist_item", "t_playlist", "t_profile_block_item", "t_profile_block", "t_media",
                "vi_cue", "cue", "video")) {
            jdbc.update("delete from " + table);
        }
    }

    private void video(String id, String title) {
        Video v = new Video(id);
        v.update(title, "GMMTV", 364, "en", SourceType.MANUAL, 2, NOW);
        videos.saveAndFlush(v);
    }

    private void withVietsub(String id, String title, Duration later, String... lines) {
        video(id, title);
        clock.reset();
        clock.advance(later);
        List<ViCue> cues = new java.util.ArrayList<>();
        for (int i = 0; i < lines.length; i++) {
            cues.add(new ViCue(i * 1000L, i * 1000L + 900, lines[i]));
        }
        vietsub.saveAuto(id, cues, "EmiBonnie");
    }

    private String read(String path) throws IOException {
        return Files.readString(out.resolve(path), StandardCharsets.UTF_8);
    }

    private JsonNode readJson(String path) throws IOException {
        return json.readTree(read(path));
    }

    @Test
    void exportsOnlyVideosWithVietsubNewestFirst() throws IOException {
        withVietsub("AAAAAAAAAA1", "Older", Duration.ofMinutes(1), "a");
        withVietsub("BBBBBBBBBB2", "Newer", Duration.ofMinutes(5), "b");
        video("CCCCCCCCCC3", "No Vietsub");

        exporter.export(out, NOW);

        JsonNode list = readJson("data/videos.json");
        assertThat(list).hasSize(2);
        assertThat(list.get(0).get("id").asText()).isEqualTo("BBBBBBBBBB2");
        assertThat(list.get(1).get("id").asText()).isEqualTo("AAAAAAAAAA1");
        assertThat(out.resolve("data/videos/CCCCCCCCCC3.json")).doesNotExist();
    }

    @Test
    void videoFilesNeverContainInternalFields() throws IOException {
        withVietsub("AAAAAAAAAA1", "Title", Duration.ZERO, "a");

        exporter.export(out, NOW);

        for (String text : List.of(read("data/videos.json"), read("data/videos/AAAAAAAAAA1.json"))) {
            assertThat(text).doesNotContain("\"subLang\"", "\"subSource\"", "\"cueCount\"", "\"fetchedAt\"",
                    "\"translationStatus\"", "\"translationError\"", "\"translationProfile\"");
            assertThat(text).contains("\"viSource\":\"AUTO\"");
        }
    }

    @Test
    void videoFileHasVietsubCues() throws IOException {
        withVietsub("AAAAAAAAAA1", "เอมี่ 💕", Duration.ZERO, "Xin chào", "Tạm biệt 💕 เอมี่");

        exporter.export(out, NOW);

        JsonNode file = readJson("data/videos/AAAAAAAAAA1.json");
        assertThat(file.get("video").get("title").asText()).isEqualTo("เอมี่ 💕");
        JsonNode cues = file.get("vietsub");
        assertThat(cues).hasSize(2);
        assertThat(cues.get(0).get("text").asText()).isEqualTo("Xin chào");
        assertThat(cues.get(1).get("startMs").asLong()).isEqualTo(1000);
        assertThat(cues.get(1).get("endMs").asLong()).isEqualTo(1900);
        assertThat(cues.get(1).get("text").asText()).isEqualTo("Tạm biệt 💕 เอมี่");
    }

    @Test
    void exportsPlaylistsInOrder() throws IOException {
        withVietsub("AAAAAAAAAA1", "First", Duration.ZERO, "a");
        withVietsub("BBBBBBBBBB2", "Second", Duration.ofMinutes(1), "b");
        long id = playlists.create("Us", "The series").id();
        playlists.addVideo(id, "BBBBBBBBBB2");
        playlists.addVideo(id, "AAAAAAAAAA1");

        exporter.export(out, NOW);

        JsonNode list = readJson("data/playlists.json");
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("videoCount").asInt()).isEqualTo(2);
        assertThat(list.get(0).get("thumbnailUrl").asText()).contains("BBBBBBBBBB2");
        assertThat(list.get(0).has("containsVideo")).isFalse();
        JsonNode detail = readJson("data/playlists/" + id + ".json");
        assertThat(detail.get("name").asText()).isEqualTo("Us");
        assertThat(detail.get("videos").get(0).get("id").asText()).isEqualTo("BBBBBBBBBB2");
        assertThat(detail.get("videos").get(1).get("id").asText()).isEqualTo("AAAAAAAAAA1");
        assertThat(detail.get("videos").get(0).has("cueCount")).isFalse();
    }

    @Test
    void rewritesProfileMediaUrlsAndCopiesOnlyUsedImages() throws IOException {
        Media used = mediaService.store("a.png", PNG);
        Media unused = mediaService.store("b.png", PNG);
        profiles.addBlock("emi", new BlockRequest(BlockType.IMAGE, null, null, used.getId(), "Fan meeting", null, null));

        exporter.export(out, NOW);

        String emi = read("data/profiles/emi.json");
        assertThat(emi).contains("\"mediaUrl\":\"/media/" + used.getStorageKey() + ".png\"");
        assertThat(emi).doesNotContain("/api/media/");
        assertThat(out.resolve("media/" + used.getStorageKey() + ".png")).exists();
        assertThat(out.resolve("media/" + unused.getStorageKey() + ".png")).doesNotExist();
        assertThat(readJson("data/profiles.json").get(0).get("slug").asText()).isEqualTo("emibonnie");
    }

    @Test
    void skipsMissingImageFileWithWarning(CapturedOutput output) throws IOException {
        Media used = mediaService.store("a.png", PNG);
        profiles.addBlock("emi", new BlockRequest(BlockType.IMAGE, null, null, used.getId(), null, null, null));
        Files.delete(DATA_DIR.resolve("media").resolve(used.getStorageKey() + ".png"));

        exporter.export(out, NOW);

        assertThat(out.resolve("media/" + used.getStorageKey() + ".png")).doesNotExist();
        assertThat(output).contains("WARN").contains("Media " + used.getId() + " is missing on disk");
    }

    @Test
    void writesSiteJson() throws IOException {
        exporter.export(out, NOW);

        assertThat(read("data/site.json")).isEqualTo("{\"publishedAt\":\"2026-11-04T10:00:00Z\",\"year\":2026}");
    }
}
