package com.subtitlestudio.novel;

import com.subtitlestudio.profile.Media;
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
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;

/** A translated novel: the eight fields guests see, its translation profile and its notebook update state. */
@EntityListeners(com.subtitlestudio.profile.MediaReferenceListener.class)
@Entity
@Table(name = "t_novel")
public class Novel {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_novel_seq")
    @SequenceGenerator(name = "t_novel_seq", sequenceName = "t_novel_seq", allocationSize = 50)
    private Long id;

    @Column(length = 60, nullable = false, unique = true)
    private String slug;

    @Column(length = 200, nullable = false)
    private String title;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cover_media_id")
    private Media cover;

    @Column(name = "original_author", length = 200)
    private String originalAuthor;

    @Lob
    @Column(name = "description")
    private String description;

    /** Comma-separated. */
    @Column(length = 500)
    private String tags;

    @Enumerated(EnumType.STRING)
    @Column(name = "novel_status", length = 20, nullable = false)
    private NovelStatus novelStatus;

    @Column(name = "translator_credit", length = 200)
    private String translatorCredit;

    @Column(name = "source_url", length = 1000)
    private String sourceUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_type", length = 20, nullable = false)
    private NovelSourceType sourceType = NovelSourceType.SCREENSHOTS;

    /** Language of the original text: {@code th} or {@code en}. */
    @Column(name = "source_language", length = 5, nullable = false)
    private String sourceLanguage = "th";

    /** Wattpad story id of a WATTPAD novel; unique; null for screenshot novels. */
    @Column(name = "wattpad_story_id", length = 20)
    private String wattpadStoryId;

    @Column(name = "prompt_profile", length = 40)
    private String promptProfile;

    @Column(name = "trailer_video_id", length = 11)
    private String trailerVideoId;

    @Enumerated(EnumType.STRING)
    @Column(name = "notebook_status", length = 20, nullable = false)
    private NotebookStatus notebookStatus = NotebookStatus.IDLE;

    @Column(name = "notebook_error", length = 500)
    private String notebookError;

    @Column(name = "notebook_pending_chapter_no")
    private Integer notebookPendingChapterNo;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Novel() {
        // for JPA
    }

    public Novel(String slug, String title, NovelStatus novelStatus, Instant at) {
        this.slug = slug;
        this.title = title;
        this.novelStatus = novelStatus;
        this.createdAt = at;
        this.updatedAt = at;
    }

    public Long getId() {
        return id;
    }

    public String getSlug() {
        return slug;
    }

    public void setSlug(String slug) {
        this.slug = slug;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public Media getCover() {
        return cover;
    }

    public void setCover(Media cover) {
        this.cover = cover;
    }

    public String getOriginalAuthor() {
        return originalAuthor;
    }

    public void setOriginalAuthor(String originalAuthor) {
        this.originalAuthor = originalAuthor;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getTags() {
        return tags;
    }

    public void setTags(String tags) {
        this.tags = tags;
    }

    public NovelStatus getNovelStatus() {
        return novelStatus;
    }

    public void setNovelStatus(NovelStatus novelStatus) {
        this.novelStatus = novelStatus;
    }

    public String getTranslatorCredit() {
        return translatorCredit;
    }

    public void setTranslatorCredit(String translatorCredit) {
        this.translatorCredit = translatorCredit;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public NovelSourceType getSourceType() {
        return sourceType;
    }

    public void setSourceType(NovelSourceType sourceType) {
        this.sourceType = sourceType;
    }

    public String getSourceLanguage() {
        return sourceLanguage;
    }

    public void setSourceLanguage(String sourceLanguage) {
        this.sourceLanguage = sourceLanguage;
    }

    public String getWattpadStoryId() {
        return wattpadStoryId;
    }

    public void setWattpadStoryId(String wattpadStoryId) {
        this.wattpadStoryId = wattpadStoryId;
    }

    public String getPromptProfile() {
        return promptProfile;
    }

    public void setPromptProfile(String promptProfile) {
        this.promptProfile = promptProfile;
    }

    public String getTrailerVideoId() {
        return trailerVideoId;
    }

    public void setTrailerVideoId(String trailerVideoId) {
        this.trailerVideoId = trailerVideoId;
    }

    public NotebookStatus getNotebookStatus() {
        return notebookStatus;
    }

    public void setNotebookStatus(NotebookStatus notebookStatus) {
        this.notebookStatus = notebookStatus;
    }

    public String getNotebookError() {
        return notebookError;
    }

    public void setNotebookError(String notebookError) {
        this.notebookError = notebookError;
    }

    public Integer getNotebookPendingChapterNo() {
        return notebookPendingChapterNo;
    }

    public void setNotebookPendingChapterNo(Integer notebookPendingChapterNo) {
        this.notebookPendingChapterNo = notebookPendingChapterNo;
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
