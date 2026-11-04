package com.subtitlestudio.playlist;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoRepository;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
class PlaylistRepositoryTest {

    private static final Instant T0 = Instant.parse("2026-11-04T10:00:00Z");

    @Autowired
    private PlaylistRepository playlists;

    @Autowired
    private PlaylistItemRepository items;

    @Autowired
    private VideoRepository videos;

    @Autowired
    private TestEntityManager em;

    @Test
    void savesPlaylistWithItemsInOrder() {
        Playlist p = playlists.save(new Playlist("VLOG OF US", "Daily vlogs", T0));
        Video a = video("aaaaaaaaaaa");
        Video b = video("bbbbbbbbbbb");
        items.save(new PlaylistItem(p, b, 1));
        items.save(new PlaylistItem(p, a, 2));
        em.flush();
        em.clear();

        Playlist loaded = playlists.findById(p.getId()).orElseThrow();
        assertThat(loaded.getName()).isEqualTo("VLOG OF US");
        assertThat(loaded.getDescription()).isEqualTo("Daily vlogs");
        assertThat(loaded.getCreatedAt()).isEqualTo(T0);
        assertThat(loaded.getUpdatedAt()).isEqualTo(T0);
        assertThat(items.findByPlaylist_IdOrderByPositionAsc(p.getId()))
                .extracting(i -> i.getVideo().getId(), PlaylistItem::getPosition)
                .containsExactly(tuple("bbbbbbbbbbb", 1), tuple("aaaaaaaaaaa", 2));
        assertThat(items.countByPlaylist_Id(p.getId())).isEqualTo(2);
        assertThat(items.findByPlaylist_IdAndVideo_Id(p.getId(), "aaaaaaaaaaa")).isPresent();
    }

    @Test
    void rejectsSameVideoTwiceInOnePlaylist() {
        Playlist p = playlists.save(new Playlist("P", null, T0));
        Video a = video("aaaaaaaaaaa");
        items.saveAndFlush(new PlaylistItem(p, a, 1));

        assertThatThrownBy(() -> items.saveAndFlush(new PlaylistItem(p, a, 2)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void listsNewestUpdatedFirst() {
        Playlist older = playlists.save(new Playlist("Older", null, T0));
        Playlist newer = playlists.save(new Playlist("Newer", null, T0.plusSeconds(60)));
        older.touch(T0.plusSeconds(120));
        em.flush();

        assertThat(playlists.findAllByOrderByUpdatedAtDesc()).extracting(Playlist::getName)
                .containsExactly("Older", "Newer");
        assertThat(newer.getUpdatedAt()).isEqualTo(T0.plusSeconds(60));
    }

    @Test
    void findsItemsByVideoAndDeletesByPlaylist() {
        Playlist p1 = playlists.save(new Playlist("P1", null, T0));
        Playlist p2 = playlists.save(new Playlist("P2", null, T0));
        Video a = video("aaaaaaaaaaa");
        items.save(new PlaylistItem(p1, a, 1));
        items.save(new PlaylistItem(p2, a, 1));
        em.flush();

        assertThat(items.findByVideo_Id("aaaaaaaaaaa")).hasSize(2);
        assertThat(items.deleteByPlaylistId(p1.getId())).isEqualTo(1);
        assertThat(items.findByVideo_Id("aaaaaaaaaaa")).extracting(i -> i.getPlaylist().getName())
                .containsExactly("P2");
    }

    @Test
    void renameChangesNameDescriptionAndUpdatedAt() {
        Playlist p = new Playlist("A", null, T0);
        p.rename("B", "desc", T0.plusSeconds(5));
        assertThat(p.getName()).isEqualTo("B");
        assertThat(p.getDescription()).isEqualTo("desc");
        assertThat(p.getUpdatedAt()).isEqualTo(T0.plusSeconds(5));
        assertThat(p.getCreatedAt()).isEqualTo(T0);
    }

    private Video video(String id) {
        Video v = new Video(id);
        v.update("Title " + id, "Channel", 60, "en", SourceType.MANUAL, 1, T0);
        return videos.save(v);
    }
}
