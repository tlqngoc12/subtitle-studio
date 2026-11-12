package com.subtitlestudio.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.EnumType;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;

/** One of the fixed profile pages, seeded by the V2 migration; {@code slug} is its URL. */
@EntityListeners(com.subtitlestudio.profile.MediaReferenceListener.class)
@Entity
@Table(name = "t_profile")
public class Profile {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_profile_seq")
    @SequenceGenerator(name = "t_profile_seq", sequenceName = "t_profile_seq", allocationSize = 50)
    private Long id;

    @Column(length = 20, nullable = false, unique = true)
    private String slug;

    @Column(name = "display_name", length = 100, nullable = false)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(length = 10, nullable = false)
    private ProfileKind kind = ProfileKind.MEMBER;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(length = 300)
    private String tagline;

    @Column(name = "full_name", length = 200)
    private String fullName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "portrait_media_id")
    private Media portrait;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Profile() {
        // for JPA
    }

    public Long getId() {
        return id;
    }

    public String getSlug() {
        return slug;
    }

    public String getDisplayName() {
        return displayName;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public ProfileKind getKind() {
        return kind;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public String getTagline() {
        return tagline;
    }

    public String getFullName() {
        return fullName;
    }

    public Media getPortrait() {
        return portrait;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public static Profile member(String slug, String displayName, int sortOrder, Instant now) {
        Profile p = new Profile();
        p.kind = ProfileKind.MEMBER;
        p.slug = slug;
        p.displayName = displayName;
        p.sortOrder = sortOrder;
        p.updatedAt = now;
        return p;
    }

    public void updateHeader(String displayName, String tagline, String fullName, Media portrait, Instant now) {
        this.displayName = displayName;
        this.tagline = tagline;
        this.fullName = fullName;
        this.portrait = portrait;
        this.updatedAt = now;
    }

    public void touch(Instant at) {
        this.updatedAt = at;
    }
}
