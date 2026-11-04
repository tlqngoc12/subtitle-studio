package com.subtitlestudio.playlist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.video.ViSource;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoDto;
import com.subtitlestudio.video.VideoNotFoundException;
import com.subtitlestudio.video.VideoRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({PlaylistService.class, PlaylistServiceTest.Config.class})
class PlaylistServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");

    @TestConfiguration
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }
    }

    @Autowired
    private PlaylistService service;

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

    // --- create / validate ---

    @Test
    void createTrimsAndStores() {
        PlaylistDetail d = service.create("  VLOG OF US  ", "  Daily  ");

        assertThat(d.name()).isEqualTo("VLOG OF US");
        assertThat(d.description()).isEqualTo("Daily");
        assertThat(d.updatedAt()).isEqualTo(NOW);
        assertThat(d.videos()).isEmpty();
    }

    @Test
    void createRejectsBlankOrTooLongName() {
        assertThatThrownBy(() -> service.create("   ", null))
                .isInstanceOfSatisfying(InvalidPlaylistException.class,
                        e -> assertThat(e.errors()).extracting(FieldError::field).containsExactly("name"));
        assertThatThrownBy(() -> service.create(null, null)).isInstanceOf(InvalidPlaylistException.class);
        assertThatThrownBy(() -> service.create("x".repeat(101), null))
                .isInstanceOfSatisfying(InvalidPlaylistException.class,
                        e -> assertThat(e.errors()).extracting(FieldError::field).containsExactly("name"));
        assertThat(service.create("x".repeat(100), null).name()).hasSize(100);
    }

    @Test
    void createRejectsTooLongDescription() {
        assertThatThrownBy(() -> service.create("ok", "d".repeat(1001)))
                .isInstanceOfSatisfying(InvalidPlaylistException.class,
                        e -> assertThat(e.errors()).extracting(FieldError::field).containsExactly("description"));
    }

    @Test
    void blankDescriptionBecomesNull() {
        assertThat(service.create("ok", "   ").description()).isNull();
    }

    // --- list ---

    @Test
    void listNewestUpdatedFirstWithCountAndThumbnail() {
        long empty = service.create("Empty", null).id();
        clock.advance(Duration.ofMinutes(1));
        long full = service.create("Full", null).id();
        service.addVideo(full, vietsub("bbbbbbbbbbb").getId());
        service.addVideo(full, vietsub("aaaaaaaaaaa").getId());

        List<PlaylistSummary> list = service.list(null);

        assertThat(list).extracting(PlaylistSummary::name).containsExactly("Full", "Empty");
        assertThat(list.get(0).videoCount()).isEqualTo(2);
        assertThat(list.get(0).thumbnailUrl()).isEqualTo("https://i.ytimg.com/vi/bbbbbbbbbbb/mqdefault.jpg");
        assertThat(list.get(1).id()).isEqualTo(empty);
        assertThat(list.get(1).videoCount()).isZero();
        assertThat(list.get(1).thumbnailUrl()).isNull();
        assertThat(list).allSatisfy(s -> assertThat(s.containsVideo()).isNull());
    }

    @Test
    void listMarksContainsVideo() {
        long with = service.create("With", null).id();
        service.create("Without", null);
        service.addVideo(with, vietsub("aaaaaaaaaaa").getId());

        assertThat(service.list("aaaaaaaaaaa"))
                .extracting(PlaylistSummary::name, PlaylistSummary::containsVideo)
                .containsExactlyInAnyOrder(tuple("With", true), tuple("Without", false));
    }

    // --- add / remove ---

    @Test
    void addVideoAppendsAtEnd() {
        long id = service.create("P", null).id();
        service.addVideo(id, vietsub("aaaaaaaaaaa").getId());
        PlaylistDetail d = service.addVideo(id, vietsub("bbbbbbbbbbb").getId());

        assertThat(d.videos()).extracting(VideoDto::id).containsExactly("aaaaaaaaaaa", "bbbbbbbbbbb");
    }

    @Test
    void addVideoTwiceKeepsPosition() {
        long id = service.create("P", null).id();
        service.addVideo(id, vietsub("aaaaaaaaaaa").getId());
        service.addVideo(id, vietsub("bbbbbbbbbbb").getId());

        PlaylistDetail d = service.addVideo(id, "aaaaaaaaaaa");

        assertThat(d.videos()).extracting(VideoDto::id).containsExactly("aaaaaaaaaaa", "bbbbbbbbbbb");
    }

    @Test
    void addVideoWithoutVietsubIs409() {
        long id = service.create("P", null).id();
        Video v = saveVideo("ccccccccccc");

        assertThatThrownBy(() -> service.addVideo(id, v.getId())).isInstanceOf(VideoHasNoVietsubException.class);
    }

    @Test
    void addUnknownVideoThrowsNotFound() {
        long id = service.create("P", null).id();

        assertThatThrownBy(() -> service.addVideo(id, "zzzzzzzzzzz")).isInstanceOf(VideoNotFoundException.class);
    }

    @Test
    void unknownPlaylistThrowsNotFound() {
        assertThatThrownBy(() -> service.get(999_999)).isInstanceOf(PlaylistNotFoundException.class);
        assertThatThrownBy(() -> service.update(999_999, "x", null)).isInstanceOf(PlaylistNotFoundException.class);
        assertThatThrownBy(() -> service.delete(999_999)).isInstanceOf(PlaylistNotFoundException.class);
        assertThatThrownBy(() -> service.addVideo(999_999, "aaaaaaaaaaa"))
                .isInstanceOf(PlaylistNotFoundException.class);
        assertThatThrownBy(() -> service.removeVideo(999_999, "aaaaaaaaaaa"))
                .isInstanceOf(PlaylistNotFoundException.class);
        assertThatThrownBy(() -> service.reorder(999_999, List.of()))
                .isInstanceOf(PlaylistNotFoundException.class);
    }

    @Test
    void removeVideoClosesTheGap() {
        long id = playlistWith("P", "aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc");

        service.removeVideo(id, "bbbbbbbbbbb");

        assertThat(service.get(id).videos()).extracting(VideoDto::id).containsExactly("aaaaaaaaaaa", "ccccccccccc");
        assertThat(positions(id)).containsExactly(1, 2);
    }

    @Test
    void removeMissingVideoIsNoop() {
        long id = playlistWith("P", "aaaaaaaaaaa");

        service.removeVideo(id, "zzzzzzzzzzz");

        assertThat(service.get(id).videos()).hasSize(1);
    }

    // --- reorder ---

    @Test
    void reorderSetsPositions() {
        long id = playlistWith("P", "aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc");

        PlaylistDetail d = service.reorder(id, List.of("ccccccccccc", "aaaaaaaaaaa", "bbbbbbbbbbb"));

        assertThat(d.videos()).extracting(VideoDto::id).containsExactly("ccccccccccc", "aaaaaaaaaaa", "bbbbbbbbbbb");
        assertThat(positions(id)).containsExactly(1, 2, 3);
    }

    @Test
    void reorderRejectsMissingExtraOrDuplicate() {
        long id = playlistWith("P", "aaaaaaaaaaa", "bbbbbbbbbbb");
        vietsub("ccccccccccc");

        assertThatThrownBy(() -> service.reorder(id, List.of("aaaaaaaaaaa")))
                .isInstanceOf(InvalidPlaylistOrderException.class);
        assertThatThrownBy(() -> service.reorder(id, List.of("aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc")))
                .isInstanceOf(InvalidPlaylistOrderException.class);
        assertThatThrownBy(() -> service.reorder(id, List.of("aaaaaaaaaaa", "aaaaaaaaaaa")))
                .isInstanceOf(InvalidPlaylistOrderException.class);
        assertThatThrownBy(() -> service.reorder(id, null)).isInstanceOf(InvalidPlaylistOrderException.class);
        assertThat(service.get(id).videos()).extracting(VideoDto::id).containsExactly("aaaaaaaaaaa", "bbbbbbbbbbb");
    }

    // --- update / updatedAt / delete ---

    @Test
    void updateRenamesAndKeepsNullFields() {
        long id = service.create("Old", "Desc").id();

        PlaylistDetail renamed = service.update(id, " New ", null);
        assertThat(renamed.name()).isEqualTo("New");
        assertThat(renamed.description()).isEqualTo("Desc");

        PlaylistDetail cleared = service.update(id, null, "");
        assertThat(cleared.name()).isEqualTo("New");
        assertThat(cleared.description()).isNull();

        assertThatThrownBy(() -> service.update(id, " ", null)).isInstanceOf(InvalidPlaylistException.class);
    }

    @Test
    void everyChangeBumpsUpdatedAt() {
        long id = service.create("P", null).id();
        String a = vietsub("aaaaaaaaaaa").getId();
        String b = vietsub("bbbbbbbbbbb").getId();

        clock.advance(Duration.ofMinutes(1));
        assertThat(service.update(id, "Q", null).updatedAt()).isEqualTo(NOW.plus(Duration.ofMinutes(1)));
        clock.advance(Duration.ofMinutes(1));
        service.addVideo(id, a);
        assertThat(service.get(id).updatedAt()).isEqualTo(NOW.plus(Duration.ofMinutes(2)));
        service.addVideo(id, b);
        clock.advance(Duration.ofMinutes(1));
        assertThat(service.reorder(id, List.of(b, a)).updatedAt()).isEqualTo(NOW.plus(Duration.ofMinutes(3)));
        clock.advance(Duration.ofMinutes(1));
        service.removeVideo(id, a);
        assertThat(service.get(id).updatedAt()).isEqualTo(NOW.plus(Duration.ofMinutes(4)));
    }

    @Test
    void deleteKeepsVideos() {
        long id = playlistWith("P", "aaaaaaaaaaa");

        service.delete(id);

        assertThatThrownBy(() -> service.get(id)).isInstanceOf(PlaylistNotFoundException.class);
        assertThat(videos.findById("aaaaaaaaaaa")).isPresent();
    }

    @Test
    void removeVideoEverywhereClosesGapsAndBumpsUpdatedAt() {
        long p1 = playlistWith("P1", "aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc");
        long p2 = playlistWith("P2", "bbbbbbbbbbb");
        long untouched = playlistWith("Other", "ddddddddddd");
        clock.advance(Duration.ofMinutes(5));

        service.removeVideoEverywhere("bbbbbbbbbbb");

        assertThat(service.get(p1).videos()).extracting(VideoDto::id).containsExactly("aaaaaaaaaaa", "ccccccccccc");
        assertThat(positions(p1)).containsExactly(1, 2);
        assertThat(service.get(p2).videos()).isEmpty();
        assertThat(service.get(p1).updatedAt()).isEqualTo(NOW.plus(Duration.ofMinutes(5)));
        assertThat(service.get(untouched).updatedAt()).isEqualTo(NOW);
    }

    // --- helpers ---

    private long playlistWith(String name, String... ids) {
        long id = service.create(name, null).id();
        for (String v : ids) {
            service.addVideo(id, vietsub(v).getId());
        }
        return id;
    }

    private List<Integer> positions(long playlistId) {
        em.flush();
        return em.getEntityManager()
                .createQuery("select i.position from PlaylistItem i where i.playlist.id = :id order by i.position",
                        Integer.class)
                .setParameter("id", playlistId).getResultList();
    }

    private Video saveVideo(String id) {
        Video v = new Video(id);
        v.update("Title " + id, "Channel", 60, "en", SourceType.MANUAL, 1, NOW);
        return videos.saveAndFlush(v);
    }

    private Video vietsub(String id) {
        Video v = videos.findById(id).orElseGet(() -> saveVideo(id));
        v.updateVietsub(3, NOW, ViSource.MANUAL);
        return videos.saveAndFlush(v);
    }
}
