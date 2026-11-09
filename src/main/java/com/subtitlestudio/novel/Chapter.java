package com.subtitlestudio.novel;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.type.YesNoConverter;

/** One chapter of a novel: its pages are {@link ChapterPage} rows. */
@Entity
@Table(name = "t_chapter")
public class Chapter {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_chapter_seq")
    @SequenceGenerator(name = "t_chapter_seq", sequenceName = "t_chapter_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "novel_id", nullable = false)
    private Novel novel;

    @Column(name = "chapter_no", nullable = false)
    private int chapterNo;

    /** Reading order inside the novel (1..n); chapter_no never changes when chapters are reordered. */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(length = 200)
    private String title;

    /** Shown instead of "Chapter N" (e.g. "Ngoại truyện 1"); null = "Chapter N". */
    @Column(length = 100)
    private String label;

    /** The whole chapter edited in one box; null until then (see {@link ChapterText}). */
    @Lob
    @Column(name = "text_vi")
    private String textVi;

    @Enumerated(EnumType.STRING)
    @Column(name = "translation_status", length = 20, nullable = false)
    private ChapterTranslationStatus translationStatus = ChapterTranslationStatus.NONE;

    @Column(name = "translation_error", length = 500)
    private String translationError;

    @Column(name = "translated_at")
    private Instant translatedAt;

    /** Gemini model(s) that translated the chapter, in order of use joined by ", "; null = unknown. */
    @Column(name = "translation_model", length = 200)
    private String translationModel;

    @Convert(converter = YesNoConverter.class)
    @Column(name = "edited_after_translation", length = 1, nullable = false)
    private boolean editedAfterTranslation;

    @Enumerated(EnumType.STRING)
    @Column(name = "publish_status", length = 20, nullable = false)
    private ChapterPublishStatus publishStatus = ChapterPublishStatus.DRAFT;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Chapter() {
        // for JPA
    }

    public Chapter(Novel novel, int chapterNo, String title, Instant at) {
        this.novel = novel;
        this.chapterNo = chapterNo;
        this.sortOrder = chapterNo;
        this.title = title;
        this.createdAt = at;
        this.updatedAt = at;
    }

    public Long getId() {
        return id;
    }

    public Novel getNovel() {
        return novel;
    }

    public int getChapterNo() {
        return chapterNo;
    }

    public void setChapterNo(int chapterNo) {
        this.chapterNo = chapterNo;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(int sortOrder) {
        this.sortOrder = sortOrder;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getTextVi() {
        return textVi;
    }

    public void setTextVi(String textVi) {
        this.textVi = textVi;
    }

    public ChapterTranslationStatus getTranslationStatus() {
        return translationStatus;
    }

    public void setTranslationStatus(ChapterTranslationStatus translationStatus) {
        this.translationStatus = translationStatus;
    }

    public String getTranslationError() {
        return translationError;
    }

    public void setTranslationError(String translationError) {
        this.translationError = translationError;
    }

    public String getTranslationModel() {
        return translationModel;
    }

    public void setTranslationModel(String translationModel) {
        this.translationModel = translationModel;
    }

    public Instant getTranslatedAt() {
        return translatedAt;
    }

    public void setTranslatedAt(Instant translatedAt) {
        this.translatedAt = translatedAt;
    }

    public boolean isEditedAfterTranslation() {
        return editedAfterTranslation;
    }

    public void setEditedAfterTranslation(boolean editedAfterTranslation) {
        this.editedAfterTranslation = editedAfterTranslation;
    }

    public ChapterPublishStatus getPublishStatus() {
        return publishStatus;
    }

    public void setPublishStatus(ChapterPublishStatus publishStatus) {
        this.publishStatus = publishStatus;
    }

    public Instant getPublishedAt() {
        return publishedAt;
    }

    public void setPublishedAt(Instant publishedAt) {
        this.publishedAt = publishedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void touch(Instant at) {
        this.updatedAt = at;
    }
}
