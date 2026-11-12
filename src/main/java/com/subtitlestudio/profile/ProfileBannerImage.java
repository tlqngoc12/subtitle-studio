package com.subtitlestudio.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;

/** One image of a profile's fanned banner; {@code altText} is optional and only read by screen readers. */
@EntityListeners(com.subtitlestudio.profile.MediaReferenceListener.class)
@Entity
@Table(name = "t_profile_banner_image")
public class ProfileBannerImage {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_profile_banner_image_seq")
    @SequenceGenerator(name = "t_profile_banner_image_seq", sequenceName = "t_profile_banner_image_seq",
            allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "media_id", nullable = false)
    private Media media;

    @Column(nullable = false)
    private int position;

    @Column(name = "alt_text", length = 200)
    private String altText;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ProfileBannerImage() {
        // for JPA
    }

    public ProfileBannerImage(Profile profile, Media media, int position, String altText, Instant createdAt) {
        this.profile = profile;
        this.media = media;
        this.position = position;
        this.altText = altText;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public Profile getProfile() {
        return profile;
    }

    public Media getMedia() {
        return media;
    }

    public int getPosition() {
        return position;
    }

    public void setPosition(int position) {
        this.position = position;
    }

    public String getAltText() {
        return altText;
    }

    public void setAltText(String altText) {
        this.altText = altText;
    }
}
