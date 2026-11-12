package com.subtitlestudio.profile;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/** One block of a profile page. Which columns are used depends on {@link #getType()} (spec section 3). */
@EntityListeners(com.subtitlestudio.profile.MediaReferenceListener.class)
@Entity
@Table(name = "t_profile_block")
public class ProfileBlock {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_profile_block_seq")
    @SequenceGenerator(name = "t_profile_block_seq", sequenceName = "t_profile_block_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "profile_id", nullable = false)
    private Profile profile;

    @Column(nullable = false)
    private int position;

    @Enumerated(EnumType.STRING)
    @Column(name = "block_type", length = 10, nullable = false)
    private BlockType type;

    @Column(length = 200)
    private String title;

    @Lob
    private String body;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "media_id")
    private Media media;

    @Column(length = 500)
    private String caption;

    @Column(name = "embed_url", length = 500)
    private String embedUrl;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "block", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position")
    private List<ProfileBlockItem> items = new ArrayList<>();

    protected ProfileBlock() {
        // for JPA
    }

    public ProfileBlock(Profile profile, int position, BlockType type, Instant now) {
        this.profile = profile;
        this.position = position;
        this.type = type;
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** Replaces the whole content; columns the block type does not use must be passed as null. */
    public void setContent(String title, String body, Media media, String caption, String embedUrl,
                           List<ProfileBlockItem> items, Instant now) {
        this.title = title;
        this.body = body;
        this.media = media;
        this.caption = caption;
        this.embedUrl = embedUrl;
        // clear + addAll (not a new list) so orphanRemoval deletes the old rows.
        this.items.clear();
        this.items.addAll(items);
        this.updatedAt = now;
    }

    public void setPosition(int position) {
        this.position = position;
    }

    public Long getId() {
        return id;
    }

    public Profile getProfile() {
        return profile;
    }

    public int getPosition() {
        return position;
    }

    public BlockType getType() {
        return type;
    }

    public String getTitle() {
        return title;
    }

    public String getBody() {
        return body;
    }

    public Media getMedia() {
        return media;
    }

    public String getCaption() {
        return caption;
    }

    public String getEmbedUrl() {
        return embedUrl;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<ProfileBlockItem> getItems() {
        return items;
    }
}
