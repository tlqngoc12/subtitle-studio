package com.subtitlestudio.video;

import com.subtitlestudio.subtitle.SourceType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** A YouTube video whose English subtitles have been fetched. Primary key is the 11-char video id. */
@Entity
@Table(name = "video")
public class Video {

    @Id
    @Column(length = 11)
    private String id;

    @Column(length = 500, nullable = false)
    private String title;

    @Column(length = 255)
    private String channel;

    @Column(name = "duration_sec")
    private Integer durationSec;

    @Column(name = "sub_lang", length = 16, nullable = false)
    private String subLang;

    @Enumerated(EnumType.STRING)
    @Column(name = "sub_source", length = 10, nullable = false)
    private SourceType subSource;

    @Column(name = "cue_count", nullable = false)
    private int cueCount;

    @Column(name = "fetched_at", nullable = false)
    private Instant fetchedAt;

    protected Video() {
        // for JPA
    }

    public Video(String id) {
        this.id = id;
    }

    public void update(String title, String channel, Integer durationSec, String subLang,
                       SourceType subSource, int cueCount, Instant fetchedAt) {
        this.title = title;
        this.channel = channel;
        this.durationSec = durationSec;
        this.subLang = subLang;
        this.subSource = subSource;
        this.cueCount = cueCount;
        this.fetchedAt = fetchedAt;
    }

    public String getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getChannel() {
        return channel;
    }

    public Integer getDurationSec() {
        return durationSec;
    }

    public String getSubLang() {
        return subLang;
    }

    public SourceType getSubSource() {
        return subSource;
    }

    public int getCueCount() {
        return cueCount;
    }

    public Instant getFetchedAt() {
        return fetchedAt;
    }
}
