package com.subtitlestudio.novel;

import com.subtitlestudio.profile.Media;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;

/** One screenshot of a chapter page and its Vietnamese translation. */
@Entity
@Table(name = "t_chapter_page")
public class ChapterPage {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_chapter_page_seq")
    @SequenceGenerator(name = "t_chapter_page_seq", sequenceName = "t_chapter_page_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "chapter_id", nullable = false)
    private Chapter chapter;

    @Column(nullable = false)
    private int position;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "media_id", nullable = false)
    private Media media;

    @Lob
    @Column(name = "text_vi")
    private String textVi;

    protected ChapterPage() {
        // for JPA
    }

    public ChapterPage(Chapter chapter, int position, Media media) {
        this.chapter = chapter;
        this.position = position;
        this.media = media;
    }

    public Long getId() {
        return id;
    }

    public Chapter getChapter() {
        return chapter;
    }

    public int getPosition() {
        return position;
    }

    public void setPosition(int position) {
        this.position = position;
    }

    public Media getMedia() {
        return media;
    }

    public String getTextVi() {
        return textVi;
    }

    public void setTextVi(String textVi) {
        this.textVi = textVi;
    }
}
