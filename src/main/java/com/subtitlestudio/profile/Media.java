package com.subtitlestudio.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;

/** An uploaded image. The file lives at {@code {data-dir}/media/{id}.{ext}}; {@code originalName} is display only. */
@Entity
@Table(name = "t_media")
public class Media {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_media_seq")
    @SequenceGenerator(name = "t_media_seq", sequenceName = "t_media_seq", allocationSize = 50)
    private Long id;

    @Column(name = "content_type", length = 50, nullable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "original_name", length = 255)
    private String originalName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Media() {
        // for JPA
    }

    public Media(String contentType, long sizeBytes, String originalName, Instant createdAt) {
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.originalName = originalName;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public String getOriginalName() {
        return originalName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
