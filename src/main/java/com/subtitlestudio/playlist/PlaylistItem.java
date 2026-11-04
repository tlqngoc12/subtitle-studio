package com.subtitlestudio.playlist;

import com.subtitlestudio.video.Video;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** One video at one position (1..n, gapless) of a playlist. */
@Entity
@Table(name = "t_playlist_item",
        uniqueConstraints = @UniqueConstraint(name = "t_playlist_item_video_uk", columnNames = {"playlist_id", "video_id"}))
public class PlaylistItem {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_playlist_item_seq")
    @SequenceGenerator(name = "t_playlist_item_seq", sequenceName = "t_playlist_item_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "playlist_id", nullable = false)
    private Playlist playlist;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "video_id", nullable = false)
    private Video video;

    @Column(nullable = false)
    private int position;

    protected PlaylistItem() {
        // for JPA
    }

    public PlaylistItem(Playlist playlist, Video video, int position) {
        this.playlist = playlist;
        this.video = video;
        this.position = position;
    }

    public void moveTo(int position) {
        this.position = position;
    }

    public Long getId() {
        return id;
    }

    public Playlist getPlaylist() {
        return playlist;
    }

    public Video getVideo() {
        return video;
    }

    public int getPosition() {
        return position;
    }
}
