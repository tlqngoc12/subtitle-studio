package com.subtitlestudio.fanfic;

import com.subtitlestudio.profile.Media;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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

/** One Wattpad story shown as a card in the Fanfics tab; everything except the id comes from Wattpad. */
@EntityListeners(com.subtitlestudio.profile.MediaReferenceListener.class)
@Entity
@Table(name = "t_fanfic")
public class Fanfic {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_fanfic_seq")
    @SequenceGenerator(name = "t_fanfic_seq", sequenceName = "t_fanfic_seq", allocationSize = 50)
    private Long id;

    @Column(name = "wattpad_id", length = 20, nullable = false, unique = true)
    private String wattpadId;

    @Column(length = 500, nullable = false)
    private String url;

    @Column(length = 300, nullable = false)
    private String title;

    @Column(length = 100)
    private String author;

    @Lob
    @Column(name = "description")
    private String description;

    /** Space separated, for searching only. */
    @Column(length = 2000)
    private String tags;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cover_media_id")
    private Media cover;

    @Column(name = "cover_source_url", length = 500)
    private String coverSourceUrl;

    @Column(name = "read_count", nullable = false)
    private long readCount;

    @Column(name = "vote_count", nullable = false)
    private long voteCount;

    @Column(name = "part_count", nullable = false)
    private long partCount;

    @Column(name = "word_count", nullable = false)
    private long wordCount;

    /** 0 or 1 (a plain number column keeps Oracle and H2 identical). */
    @Column(nullable = false)
    private int completed;

    @Column(name = "story_updated_at")
    private Instant storyUpdatedAt;

    @Column(name = "fetched_at", nullable = false)
    private Instant fetchedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Fanfic() {
        // for JPA
    }

    public Fanfic(Instant now) {
        this.createdAt = now;
        this.fetchedAt = now;
    }

    public void set(String wattpadId, String url, String title, String author, String description, String tags,
                    Media cover, String coverSourceUrl, long readCount, long voteCount, long partCount, long wordCount,
                    boolean completed, Instant storyUpdatedAt, Instant fetchedAt) {
        this.wattpadId = wattpadId;
        this.url = url;
        this.title = title;
        this.author = author;
        this.description = description;
        this.tags = tags;
        this.cover = cover;
        this.coverSourceUrl = coverSourceUrl;
        this.readCount = readCount;
        this.voteCount = voteCount;
        this.partCount = partCount;
        this.wordCount = wordCount;
        this.completed = completed ? 1 : 0;
        this.storyUpdatedAt = storyUpdatedAt;
        this.fetchedAt = fetchedAt;
    }

    public Long getId() {
        return id;
    }

    public String getWattpadId() {
        return wattpadId;
    }

    public String getUrl() {
        return url;
    }

    public String getTitle() {
        return title;
    }

    public String getAuthor() {
        return author;
    }

    public String getDescription() {
        return description;
    }

    public String getTags() {
        return tags;
    }

    public Media getCover() {
        return cover;
    }

    public String getCoverSourceUrl() {
        return coverSourceUrl;
    }

    public long getReadCount() {
        return readCount;
    }

    public long getVoteCount() {
        return voteCount;
    }

    public long getPartCount() {
        return partCount;
    }

    public long getWordCount() {
        return wordCount;
    }

    public boolean isCompleted() {
        return completed == 1;
    }

    public Instant getStoryUpdatedAt() {
        return storyUpdatedAt;
    }

    public Instant getFetchedAt() {
        return fetchedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
