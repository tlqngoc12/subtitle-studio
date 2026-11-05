package com.subtitlestudio.novel;

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
import java.time.Instant;

/** The story notebook as it stood after chapter {@code afterChapterNo} was published. */
@Entity
@Table(name = "t_novel_notebook")
public class NovelNotebook {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_novel_notebook_seq")
    @SequenceGenerator(name = "t_novel_notebook_seq", sequenceName = "t_novel_notebook_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "novel_id", nullable = false)
    private Novel novel;

    @Column(name = "after_chapter_no", nullable = false)
    private int afterChapterNo;

    @Lob
    @Column(name = "content_json", nullable = false)
    private String contentJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected NovelNotebook() {
        // for JPA
    }

    public NovelNotebook(Novel novel, int afterChapterNo, String contentJson, Instant createdAt) {
        this.novel = novel;
        this.afterChapterNo = afterChapterNo;
        this.contentJson = contentJson;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public Novel getNovel() {
        return novel;
    }

    public int getAfterChapterNo() {
        return afterChapterNo;
    }

    public String getContentJson() {
        return contentJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void replace(String contentJson, Instant at) {
        this.contentJson = contentJson;
        this.createdAt = at;
    }
}
