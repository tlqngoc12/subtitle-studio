package com.subtitlestudio.video;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** One stored Vietsub line. Independent of the English cues: it keeps the uploaded file's own timing. */
@Entity
@Table(name = "vi_cue",
        uniqueConstraints = @UniqueConstraint(name = "uk_vi_cue_video_idx", columnNames = {"video_id", "idx"}))
public class ViCueEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "vi_cue_seq")
    @SequenceGenerator(name = "vi_cue_seq", sequenceName = "vi_cue_seq", allocationSize = 50)
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

    @Column(length = 1000, nullable = false)
    private String text;

    protected ViCueEntity() {
        // for JPA
    }

    public ViCueEntity(Video video, int idx, long startMs, long endMs, String text) {
        this.video = video;
        this.idx = idx;
        this.startMs = startMs;
        this.endMs = endMs;
        this.text = text;
    }

    public ViCue toViCue() {
        return new ViCue(startMs, endMs, text);
    }
}
