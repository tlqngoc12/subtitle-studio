package com.subtitlestudio.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * An uploaded image. The file lives at {@code {data-dir}/media/{storagePath}} (legacy rows: {@code {storageKey}.{ext}}); {@code originalName} is display
 * only. The key is random so databases sharing the data directory (H2 dev, Oracle) never pick the same file name.
 */
@Entity
@Table(name = "t_media")
public class Media {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_media_seq")
    @SequenceGenerator(name = "t_media_seq", sequenceName = "t_media_seq", allocationSize = 50)
    private Long id;

    @Column(name = "storage_key", length = 36, nullable = false, unique = true)
    private String storageKey;

    @Column(name = "content_type", length = 50, nullable = false)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "original_name", length = 255)
    private String originalName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** Path relative to the media directory; null = legacy flat file {storageKey}.{ext}. */
    @Column(name = "storage_path", length = 400)
    private String storagePath;

    @Column(name = "width")
    private Integer width;

    @Column(name = "height")
    private Integer height;

    protected Media() {
        // for JPA
    }

    public Media(String contentType, long sizeBytes, String originalName, Instant createdAt) {
        this.storageKey = UUID.randomUUID().toString();
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.originalName = originalName;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getStorageKey() {
        return storageKey;
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

    public String getStoragePath() {
        return storagePath;
    }

    public void setStoragePath(String storagePath) {
        this.storagePath = storagePath;
    }

    public Integer getWidth() {
        return width;
    }

    public Integer getHeight() {
        return height;
    }

    public void setSize(int width, int height) {
        this.width = width;
        this.height = height;
    }
}
