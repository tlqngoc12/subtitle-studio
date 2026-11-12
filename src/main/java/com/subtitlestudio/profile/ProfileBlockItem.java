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

/** An entry of a GALLERY (image + caption), LINKS (name + URL) or FACTS (label + value) block. */
@EntityListeners(com.subtitlestudio.profile.MediaReferenceListener.class)
@Entity
@Table(name = "t_profile_block_item")
public class ProfileBlockItem {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_profile_block_item_seq")
    @SequenceGenerator(name = "t_profile_block_item_seq", sequenceName = "t_profile_block_item_seq",
            allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "block_id", nullable = false)
    private ProfileBlock block;

    @Column(nullable = false)
    private int position;

    @Column(length = 200)
    private String label;

    @Column(name = "item_value", length = 1000)
    private String value;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "media_id")
    private Media media;

    protected ProfileBlockItem() {
        // for JPA
    }

    public ProfileBlockItem(ProfileBlock block, int position, String label, String value, Media media) {
        this.block = block;
        this.position = position;
        this.label = label;
        this.value = value;
        this.media = media;
    }

    public Long getId() {
        return id;
    }

    public int getPosition() {
        return position;
    }

    public String getLabel() {
        return label;
    }

    public String getValue() {
        return value;
    }

    public Media getMedia() {
        return media;
    }
}
