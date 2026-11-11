package com.subtitlestudio.photo;

import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.Profile;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** One Instagram post shown as a tile: the uploaded first image, a title, a date and the people on it. */
@Entity
@Table(name = "t_photo_post")
public class PhotoPost {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_photo_post_seq")
    @SequenceGenerator(name = "t_photo_post_seq", sequenceName = "t_photo_post_seq", allocationSize = 50)
    private Long id;

    @Column(name = "instagram_url", length = 300, nullable = false, unique = true)
    private String instagramUrl;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "media_id", nullable = false)
    private Media media;

    @Column(length = 200, nullable = false)
    private String title;

    // Oracle DATE and H2 (MODE=Oracle) DATE both come back as TIMESTAMP, so map them that way; only the day is used.
    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "taken_on", nullable = false)
    private LocalDate takenOn;

    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "taken_until")
    private LocalDate takenUntil;

    @Enumerated(EnumType.STRING)
    @Column(length = 10, nullable = false)
    private PhotoSource source;

    @Column(name = "photo_count")
    private Integer photoCount;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "t_photo_post_profile", joinColumns = @JoinColumn(name = "post_id"),
            inverseJoinColumns = @JoinColumn(name = "profile_id"))
    private Set<Profile> profiles = new HashSet<>();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PhotoPost() {
        // for JPA
    }

    public PhotoPost(Instant now) {
        this.createdAt = now;
        this.updatedAt = now;
    }

    public void set(String instagramUrl, Media media, String title, LocalDate takenOn, LocalDate takenUntil,
                    PhotoSource source, Integer photoCount, Set<Profile> profiles, Instant now) {
        this.instagramUrl = instagramUrl;
        this.media = media;
        this.title = title;
        this.takenOn = takenOn;
        this.takenUntil = takenUntil;
        this.source = source;
        this.photoCount = photoCount;
        this.profiles.clear();
        this.profiles.addAll(profiles);
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public String getInstagramUrl() {
        return instagramUrl;
    }

    public Media getMedia() {
        return media;
    }

    public String getTitle() {
        return title;
    }

    public LocalDate getTakenOn() {
        return takenOn;
    }

    public LocalDate getTakenUntil() {
        return takenUntil;
    }

    public PhotoSource getSource() {
        return source;
    }

    public Integer getPhotoCount() {
        return photoCount;
    }

    public Set<Profile> getProfiles() {
        return profiles;
    }
}
