package com.subtitlestudio.playlist;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;

/** A named, ordered list of videos that have Vietsub. The videos are {@link PlaylistItem} rows. */
@Entity
@Table(name = "t_playlist")
public class Playlist {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_playlist_seq")
    @SequenceGenerator(name = "t_playlist_seq", sequenceName = "t_playlist_seq", allocationSize = 50)
    private Long id;

    @Column(length = 100, nullable = false)
    private String name;

    @Column(length = 1000)
    private String description;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Playlist() {
        // for JPA
    }

    public Playlist(String name, String description, Instant at) {
        this.name = name;
        this.description = description;
        this.createdAt = at;
        this.updatedAt = at;
    }

    public void rename(String name, String description, Instant at) {
        this.name = name;
        this.description = description;
        this.updatedAt = at;
    }

    /** Marks the playlist as changed (videos added, removed or reordered). */
    public void touch(Instant at) {
        this.updatedAt = at;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
