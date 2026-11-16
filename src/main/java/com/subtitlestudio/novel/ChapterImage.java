package com.subtitlestudio.novel;

import com.subtitlestudio.profile.Media;
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

/** An image of a Wattpad text chapter. The chapter text refers to it by an {@link ImageMarkers marker}. */
@EntityListeners(com.subtitlestudio.profile.MediaReferenceListener.class)
@Entity
@Table(name = "t_chapter_image")
public class ChapterImage {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_chapter_image_seq")
    @SequenceGenerator(name = "t_chapter_image_seq", sequenceName = "t_chapter_image_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "chapter_id", nullable = false)
    private Chapter chapter;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "media_id", nullable = false)
    private Media media;

    @Column(name = "source_url", length = 1000, nullable = false)
    private String sourceUrl;

    @Column(nullable = false)
    private int position;

    protected ChapterImage() {
        // for JPA
    }

    public ChapterImage(Chapter chapter, Media media, String sourceUrl, int position) {
        this.chapter = chapter;
        this.media = media;
        this.sourceUrl = sourceUrl;
        this.position = position;
    }

    public Long getId() {
        return id;
    }

    public Chapter getChapter() {
        return chapter;
    }

    public Media getMedia() {
        return media;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public int getPosition() {
        return position;
    }

    public void setPosition(int position) {
        this.position = position;
    }
}
