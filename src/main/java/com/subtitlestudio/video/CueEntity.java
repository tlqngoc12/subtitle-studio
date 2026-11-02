package com.subtitlestudio.video;

import com.subtitlestudio.subtitle.Cue;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** One stored subtitle cue. Named CueEntity to avoid clashing with the {@link Cue} domain record. */
@Entity
@Table(name = "cue",
        uniqueConstraints = @UniqueConstraint(name = "uk_cue_video_idx", columnNames = {"video_id", "idx"}),
        indexes = @Index(name = "ix_cue_video", columnList = "video_id"))
public class CueEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "video_id", nullable = false)
    private Video video;

    @Column(nullable = false)
    private int idx;

    @Column(name = "start_ms", nullable = false)
    private long startMs;

    @Column(name = "end_ms", nullable = false)
    private long endMs;

    @Column(name = "text_en", length = 1000, nullable = false)
    private String textEn;

    /** Reserved for Phase 2 (manual Vietnamese translation); unused in Phase 1. */
    @Column(name = "text_vi", length = 1000)
    private String textVi;

    protected CueEntity() {
        // for JPA
    }

    public CueEntity(Video video, int idx, long startMs, long endMs, String textEn) {
        this.video = video;
        this.idx = idx;
        this.startMs = startMs;
        this.endMs = endMs;
        this.textEn = textEn;
    }

    public Cue toCue() {
        return new Cue(startMs, endMs, textEn);
    }

    public Long getId() {
        return id;
    }

    public int getIdx() {
        return idx;
    }

    public long getStartMs() {
        return startMs;
    }

    public long getEndMs() {
        return endMs;
    }

    public String getTextEn() {
        return textEn;
    }

    public String getTextVi() {
        return textVi;
    }
}
