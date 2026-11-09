package com.subtitlestudio.oracle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.profile.BlockDto;
import com.subtitlestudio.profile.BlockRequest;
import com.subtitlestudio.profile.BlockType;
import com.subtitlestudio.profile.ItemRequest;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.ProfileBlockRepository;
import com.subtitlestudio.profile.ProfileService;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.video.CueEntity;
import com.subtitlestudio.video.CueRepository;
import com.subtitlestudio.video.SubtitleService;
import com.subtitlestudio.video.ViCueEntity;
import com.subtitlestudio.video.ViCueRepository;
import com.subtitlestudio.video.ViCue;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VietsubService;
import com.subtitlestudio.video.VietsubTextRequest;
import com.subtitlestudio.video.VideoRepository;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Persistence on real Oracle, with the real "oracle" profile (Flyway placeholders, Hibernate validate).
 * The container's URL and credentials replace the profile's datasource via @ServiceConnection.
 */
@SpringBootTest(properties = {"SUBTITLESTUDIO_DB_USER=unused", "SUBTITLESTUDIO_DB_PASSWORD=unused"})
@ActiveProfiles("oracle")
@Import({OracleTestContainer.Config.class, PersistenceOracleIT.FixedClockConfig.class})
class PersistenceOracleIT {

    private static final Instant AT = Instant.parse("2026-11-03T01:02:03.123456Z");
    private static final String ID = "ORACLE00001";

    /** A clock with sub-microsecond digits: Oracle rounds them, so a stored and a returned value could differ. */
    @TestConfiguration(proxyBeanMethods = false)
    static class FixedClockConfig {
        @Bean
        @Primary
        Clock testClock() {
            return Clock.fixed(Instant.parse("2026-11-09T10:00:00.1234567Z"), ZoneOffset.UTC);
        }
    }

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        try {
            Path dir = Files.createTempDirectory("subtitle-studio-oracle-it");
            registry.add("subtitle-studio.data-dir", dir::toString);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @Autowired
    private VietsubService vietsubService;

    @Autowired
    private VideoRepository videos;

    @Autowired
    private CueRepository cues;

    @Autowired
    private ViCueRepository viCues;

    @Autowired
    private SubtitleService subtitleService;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ProfileService profileService;

    @Autowired
    private ProfileBlockRepository blocks;

    @Autowired
    private MediaRepository media;

    @AfterEach
    void cleanUp() {
        blocks.deleteAll();
        media.deleteAll();
        viCues.deleteAll();
        cues.deleteAll();
        videos.deleteAll();
    }

    @Test
    void migratesAndValidatesOnOracle() {
        assertThat(jdbc.queryForObject(
                "select count(*) from \"flyway_schema_history\" where \"success\" = 1", Integer.class))
                .isGreaterThanOrEqualTo(1);
    }

    @Test
    void onlyFlywayCreatesTables() {
        // Hibernate creates HTE_* global temporary tables on Oracle at startup unless told not to.
        assertThat(jdbc.queryForList("select table_name from user_tables order by table_name", String.class))
                .containsExactly("CUE", "T_CHAPTER", "T_CHAPTER_PAGE", "T_MEDIA", "T_NOVEL", "T_NOVEL_NOTEBOOK",
                        "T_PLAYLIST", "T_PLAYLIST_ITEM", "T_PROFILE", "T_PROFILE_BANNER_IMAGE", "T_PROFILE_BLOCK",
                        "T_PROFILE_BLOCK_ITEM", "VIDEO",
                        "VI_CUE", "flyway_schema_history");
    }

    @Test
    void seedsThreeProfilesOnOracle() {
        assertThat(jdbc.queryForList("select slug from t_profile order by id", String.class))
                .containsExactly("emibonnie", "emi", "bonnie");
    }

    @Test
    void storesThaiEmojiMarkdownClob() {
        String line = "เอมี่-บอนนี่ 💕 Tiếng Việt có dấu ữ ầ ọ\n";
        String body = line.repeat(50_000 / line.length() + 1).substring(0, 50_000);
        String label = "เ".repeat(200);

        profileService.addBlock("emi", new BlockRequest(BlockType.TEXT, null, body, null, null, null, null));
        profileService.addBlock("emi", new BlockRequest(BlockType.FACTS, null, null, null, null, null,
                List.of(new ItemRequest(label, "13/05/1999", null))));

        List<BlockDto> loaded = profileService.get("emi").blocks();
        assertThat(loaded.get(0).body()).isEqualTo(body);
        assertThat(loaded.get(1).items().get(0).label()).isEqualTo(label);
    }

    @Test
    void cascadesBlockItemsOnOracle() {
        BlockDto links = profileService.addBlock("emi", new BlockRequest(BlockType.LINKS, null, null, null, null, null,
                List.of(new ItemRequest("A", "https://a.example", null), new ItemRequest("B", "https://b.example", null),
                        new ItemRequest("C", "https://c.example", null))));

        profileService.deleteBlock("emi", links.id());

        assertThat(jdbc.queryForObject("select count(*) from t_profile_block_item", Integer.class)).isZero();
    }

    @Test
    void rejectsUnknownViSource() {
        videos.save(video(ID, "t"));

        assertThatThrownBy(() -> jdbc.update("update video set vi_source = 'X' where id = ?", ID))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void storesEmojiAndLongThaiTitle() {
        String title = "ก".repeat(480) + "😀🎬🍓";
        videos.save(video(ID, title));

        assertThat(videos.findById(ID).orElseThrow().getTitle()).isEqualTo(title);
    }

    @Test
    void storesThousandCharVietnameseCue() {
        Video v = videos.save(video(ID, "t"));
        viCues.save(new ViCueEntity(v, 0, 0, 1_000, "ạ".repeat(1000)));

        assertThat(viCues.findByVideo_IdOrderByIdxAsc(ID).get(0).toViCue().text()).hasSize(1000);
    }

    @Test
    void savesAndReadsThousandsOfCuesInOrder() {
        Video v = videos.save(video(ID, "t"));
        cues.saveAll(IntStream.range(0, 3_200)
                .mapToObj(i -> new CueEntity(v, i, i * 1_000L, i * 1_000L + 900, "line " + i))
                .toList());

        List<CueEntity> loaded = cues.findByVideo_IdOrderByIdxAsc(ID);
        assertThat(loaded).hasSize(3_200);
        assertThat(loaded.get(3_199).toCue().startMs()).isEqualTo(3_199_000L);
    }

    @Test
    void deletesVideoWithEnglishAndVietsub() {
        Video v = videos.save(video(ID, "t"));
        cues.saveAll(List.of(new CueEntity(v, 0, 0, 1_000, "a"), new CueEntity(v, 1, 1_000, 2_000, "b")));
        viCues.saveAll(List.of(new ViCueEntity(v, 0, 0, 1_000, "a"), new ViCueEntity(v, 1, 1_000, 2_000, "b")));

        subtitleService.delete(ID);

        assertThat(videos.findById(ID)).isEmpty();
        assertThat(cues.findByVideo_IdOrderByIdxAsc(ID)).isEmpty();
        assertThat(viCues.findByVideo_IdOrderByIdxAsc(ID)).isEmpty();
    }

    @Test
    void roundTripsInstantWithMicroseconds() {
        videos.save(video(ID, "t"));

        assertThat(videos.findById(ID).orElseThrow().getFetchedAt()).isEqualTo(AT);
    }

    @Test
    void blankTextNeverReachesOracle() {
        Video v = videos.save(video(ID, "t"));

        // Oracle stores '' as NULL, so a blank cue breaks NOT NULL: blank text must be filtered before saving.
        assertThatThrownBy(() -> cues.saveAndFlush(new CueEntity(v, 0, 0, 1_000, "")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void secondVietsubTextSaveWithTheReturnedTimestampIsNotStale() {
        videos.save(video(ID, "t"));
        vietsubService.saveAuto(ID, List.of(new ViCue(0, 1_000, "a"), new ViCue(1_000, 2_000, "b")), "p");
        Instant base = videos.findById(ID).orElseThrow().getViUpdatedAt();

        Video first = vietsubService.saveText(ID, new VietsubTextRequest(base, List.of(
                new VietsubTextRequest.LineText(0, "A"), new VietsubTextRequest.LineText(1, "b"))));
        Video second = vietsubService.saveText(ID, new VietsubTextRequest(first.getViUpdatedAt(), List.of(
                new VietsubTextRequest.LineText(0, "A"), new VietsubTextRequest.LineText(1, "B"))));

        assertThat(second.getViUpdatedAt()).isEqualTo(videos.findById(ID).orElseThrow().getViUpdatedAt());
    }

    private static Video video(String id, String title) {
        Video v = new Video(id);
        v.update(title, null, 60, "en", SourceType.MANUAL, 0, AT);
        return v;
    }
}
