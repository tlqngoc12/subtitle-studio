package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.novel.Chapter;
import com.subtitlestudio.novel.ChapterPage;
import com.subtitlestudio.novel.ChapterPageRepository;
import com.subtitlestudio.novel.ChapterPublishStatus;
import com.subtitlestudio.novel.ChapterRepository;
import com.subtitlestudio.novel.Novel;
import com.subtitlestudio.novel.NovelNotebook;
import com.subtitlestudio.novel.NovelNotebookRepository;
import com.subtitlestudio.novel.NovelRepository;
import com.subtitlestudio.novel.NovelStatus;
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
import org.springframework.transaction.support.TransactionTemplate;
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

    @Autowired
    private NovelRepository novels;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private ChapterPageRepository chapterPages;

    @Autowired
    private NovelNotebookRepository notebooks;

    @Autowired
    private TransactionTemplate tx;

    @Autowired
    private NovelExporter novelExporter;

    @Autowired
    private com.subtitlestudio.config.SubtitleStudioProperties properties;

    private final ObjectMapper json = new ObjectMapper();

    @TempDir
    Path out;

    @BeforeEach
    void setUp() {
        clock.reset();
    }

    @AfterEach
    void cleanUp() {
        for (String table : List.of("t_novel_notebook", "t_chapter_page", "t_chapter", "t_novel", "t_playlist_item", "t_playlist", "t_profile_block_item", "t_profile_block", "t_media",
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

    // --- novels ---

    private static final String SECRET = "ZZ-SECRET-TEXT-ZZ";

    /** A novel with chapters 1..n; {@code published} lists the published numbers. Returns the novel id. */
    private long novel(String slug, Long coverId, int chapterCount, int... published) {
        return tx.execute(s -> {
            Novel n = new Novel(slug, "Tình Yêu " + slug, NovelStatus.ONGOING, NOW);
            n.setPromptProfile("SecretProfileName");
            n.setTags("romance,BL");
            n.setTranslatorCredit("Dịch: @byZenQN");
            n.setDescription("Giới thiệu");
            novels.save(n);
            if (coverId != null) {
                n.setCover(entityMedia(coverId));
            }
            for (int no = 1; no <= chapterCount; no++) {
                Chapter c = new Chapter(n, no, "Tựa " + no, NOW);
                if (no == 3) {
                    c.setLabel("Ngoại truyện 1");
                }
                int chapterNo = no;
                if (java.util.Arrays.stream(published).anyMatch(p -> p == chapterNo)) {
                    c.setPublishStatus(ChapterPublishStatus.PUBLISHED);
                }
                chapters.save(c);
                ChapterPage page = new ChapterPage(c, 1, entityMedia(mediaService.store("shot.png", PNG).getId()));
                page.setTextVi("Chương " + no + " " + SECRET);
                chapterPages.save(page);
            }
            notebooks.save(new NovelNotebook(n, 1, "{\"storySoFar\":\"NOTEBOOK-SECRET\"}", NOW));
            return n.getId();
        });
    }

    @Autowired
    private com.subtitlestudio.profile.MediaRepository mediaRepository;

    private Media entityMedia(long id) {
        return mediaRepository.findById(id).orElseThrow();
    }

    @Test
    void exportsOnlyNovelsWithPublishedChapters() throws IOException {
        novel("drafts-only", null, 2);
        novel("summer", null, 2, 1);

        exporter.export(out, NOW);

        JsonNode list = readJson("data/novels.json");
        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("slug").asText()).isEqualTo("summer");
        assertThat(list.get(0).get("publishedCount").asInt()).isEqualTo(1);
        assertThat(list.get(0).get("tags").get(1).asText()).isEqualTo("BL");
        assertThat(out.resolve("data/novels/drafts-only.json")).doesNotExist();
    }

    @Test
    void chaptersFollowTheReadingOrderNotTheNumber() throws IOException {
        long id = novel("summer", null, 3, 1, 2, 3);
        tx.executeWithoutResult(s -> chapters.findByNovelIdOrderByChapterNo(id).forEach(c -> c.setSortOrder(
                switch (c.getChapterNo()) {
                    case 3 -> 1;
                    case 1 -> 2;
                    default -> 3;
                })));

        exporter.export(out, NOW);

        JsonNode detail = readJson("data/novels/summer.json");
        assertThat(detail.get("chapters")).extracting(n -> n.get("chapterNo").asInt()).containsExactly(3, 1, 2);
        JsonNode one = readJson("data/novels/summer/1.json");
        assertThat(one.get("prev").asInt()).isEqualTo(3);
        assertThat(one.get("next").asInt()).isEqualTo(2);
        assertThat(readJson("data/novels/summer/3.json").get("prev").isNull()).isTrue();
    }

    @Test
    void chapterListOnlyPublished() throws IOException {
        novel("summer", null, 3, 1, 3);

        exporter.export(out, NOW);

        JsonNode detail = readJson("data/novels/summer.json");
        assertThat(detail.get("chapters")).hasSize(2);
        assertThat(detail.get("chapters").get(1).get("chapterNo").asInt()).isEqualTo(3);
        assertThat(detail.get("translatorCredit").asText()).isEqualTo("Dịch: @byZenQN");
        assertThat(detail.get("description").asText()).isEqualTo("Giới thiệu");
        JsonNode three = readJson("data/novels/summer/3.json");
        assertThat(three.get("prev").asInt()).isEqualTo(1);
        assertThat(three.get("next").isNull()).isTrue();
        assertThat(three.get("title").asText()).isEqualTo("Tựa 3");
        assertThat(three.get("label").asText()).isEqualTo("Ngoại truyện 1");
        assertThat(detail.get("chapters").get(1).get("label").asText()).isEqualTo("Ngoại truyện 1");
        assertThat(detail.get("chapters").get(0).get("label").isNull()).isTrue();
        assertThat(out.resolve("data/novels/summer/2.json")).doesNotExist();
    }

    @Test
    void publicJsonHasNoChapterText() throws IOException {
        novel("summer", null, 2, 1, 2);

        exporter.export(out, NOW);

        try (var files = Files.walk(out)) {
            for (Path f : files.filter(Files::isRegularFile).toList()) {
                byte[] bytes = Files.readAllBytes(f);
                String text = new String(bytes, StandardCharsets.UTF_8);
                assertThat(text).as(f.toString()).doesNotContain(SECRET).doesNotContain("NOTEBOOK-SECRET")
                        .doesNotContain("SecretProfileName");
                assertThat(bytes).as(f.toString()).isNotEqualTo(PNG);
            }
        }
    }

    @Test
    void copiesRenderedImagesAndCover() throws IOException {
        Media cover = mediaService.store("cover.png", PNG);
        novel("summer", cover.getId(), 1, 1);

        exporter.export(out, NOW);

        JsonNode chapter = readJson("data/novels/summer/1.json");
        String image = chapter.get("images").get(0).asText();
        assertThat(image).matches("/novels/summer/[0-9a-f]{16}-1\\.(webp|png)");
        assertThat(out.resolve(image.substring(1))).exists();
        assertThat(readJson("data/novels/summer.json").get("coverUrl").asText())
                .isEqualTo("/media/" + cover.getStorageKey() + ".png");
        assertThat(out.resolve("media/" + cover.getStorageKey() + ".png")).exists();
    }

    @Test
    void warnsAboveFileLimit(CapturedOutput output) {
        novel("summer", null, 1, 1);
        SiteExporter small = new SiteExporter(subtitlesService, vietsub, playlists, profiles, mediaRepository,
                properties, appMapper, novelExporter, 3);

        small.export(out, NOW);

        assertThat(output).contains("WARN").contains("Cloudflare Pages Free allows 20,000");
    }

    @Autowired
    private com.subtitlestudio.video.SubtitleService subtitlesService;

    @Autowired
    private ObjectMapper appMapper;
}
