package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.subtitle.SourceType;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
// Keep the configured H2 URL (MODE=Oracle) instead of Spring's plain embedded H2.
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
class VideoRepositoryTest {

    @Autowired
    private VideoRepository videos;

    @Autowired
    private CueRepository cues;

    @Autowired
    private TestEntityManager em;

    @Test
    void savesAndLoadsVideoWithAllColumns() {
        Video video = video("dQw4w9WgXcQ", Instant.parse("2026-11-02T10:00:00Z"));
        videos.saveAndFlush(video);
        em.clear();

        Video loaded = videos.findById("dQw4w9WgXcQ").orElseThrow();

        assertThat(loaded.getTitle()).isEqualTo("Title dQw4w9WgXcQ");
        assertThat(loaded.getChannel()).isEqualTo("Channel");
        assertThat(loaded.getDurationSec()).isEqualTo(754);
        assertThat(loaded.getSubLang()).isEqualTo("en-orig");
        assertThat(loaded.getSubSource()).isEqualTo(SourceType.AUTO);
        assertThat(loaded.getCueCount()).isEqualTo(2);
        assertThat(loaded.getFetchedAt()).isEqualTo(Instant.parse("2026-11-02T10:00:00Z"));
    }

    @Test
    void storesFiveHundredCharThaiTitle() {
        String title = "ก".repeat(500);
        Video v = new Video("THAI0000001");
        v.update(title, null, 60, "en", SourceType.MANUAL, 0, Instant.parse("2026-11-03T00:00:00Z"));
        videos.saveAndFlush(v);
        em.clear();

        assertThat(videos.findById("THAI0000001").orElseThrow().getTitle()).hasSize(500).isEqualTo(title);
    }

    @Test
    void listsVideosNewestFirst() {
        videos.save(video("OLD00000001", Instant.parse("2026-11-01T00:00:00Z")));
        videos.save(video("NEW00000001", Instant.parse("2026-11-03T00:00:00Z")));
        videos.save(video("MID00000001", Instant.parse("2026-11-02T00:00:00Z")));

        assertThat(videos.findAllByOrderByFetchedAtDesc()).extracting(Video::getId)
                .containsExactly("NEW00000001", "MID00000001", "OLD00000001");
    }

    @Test
    void loadsCuesOfOneVideoOrderedByIdx() {
        Video a = videos.save(video("AAAAAAAAAAA", Instant.now()));
        Video b = videos.save(video("BBBBBBBBBBB", Instant.now()));
        cues.save(new CueEntity(a, 1, 2_000, 3_000, "a-second"));
        cues.save(new CueEntity(b, 0, 0, 1_000, "b-first"));
        cues.save(new CueEntity(a, 0, 0, 1_000, "a-first"));
        em.flush();
        em.clear();

        assertThat(cues.findByVideo_IdOrderByIdxAsc("AAAAAAAAAAA")).extracting(CueEntity::getTextEn)
                .containsExactly("a-first", "a-second");
    }

    @Test
    void textViIsEmptyUntilPhase2() {
        Video a = videos.save(video("AAAAAAAAAAA", Instant.now()));
        cues.saveAndFlush(new CueEntity(a, 0, 0, 1_000, "hello"));
        em.clear();

        assertThat(cues.findByVideo_IdOrderByIdxAsc("AAAAAAAAAAA").get(0).getTextVi()).isNull();
    }

    @Test
    void rejectsDuplicateIdxWithinSameVideo() {
        Video a = videos.save(video("AAAAAAAAAAA", Instant.now()));
        cues.saveAndFlush(new CueEntity(a, 0, 0, 1_000, "first"));

        assertThatThrownBy(() -> cues.saveAndFlush(new CueEntity(a, 0, 1_000, 2_000, "duplicate idx")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deleteByVideoIdRemovesOnlyThatVideosCues() {
        Video a = videos.save(video("AAAAAAAAAAA", Instant.now()));
        Video b = videos.save(video("BBBBBBBBBBB", Instant.now()));
        cues.save(new CueEntity(a, 0, 0, 1_000, "a"));
        cues.save(new CueEntity(a, 1, 1_000, 2_000, "a"));
        cues.save(new CueEntity(b, 0, 0, 1_000, "b"));
        em.flush();

        int deleted = cues.deleteByVideoId("AAAAAAAAAAA");

        assertThat(deleted).isEqualTo(2);
        assertThat(cues.findByVideo_IdOrderByIdxAsc("AAAAAAAAAAA")).isEmpty();
        assertThat(cues.findByVideo_IdOrderByIdxAsc("BBBBBBBBBBB")).hasSize(1);
    }

    private static Video video(String id, Instant fetchedAt) {
        Video v = new Video(id);
        v.update("Title " + id, "Channel", 754, "en-orig", SourceType.AUTO, 2, fetchedAt);
        return v;
    }
}
