package com.subtitlestudio.profile;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;

/** One of the fixed profile pages, seeded by the V2 migration; {@code slug} is its URL. */
@Entity
@Table(name = "t_profile")
public class Profile {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_profile_seq")
    @SequenceGenerator(name = "t_profile_seq", sequenceName = "t_profile_seq", allocationSize = 50)
    private Long id;

    @Column(length = 20, nullable = false, unique = true)
    private String slug;

    @Column(name = "display_name", length = 100, nullable = false)
    private String displayName;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Profile() {
        // for JPA
    }

    public Long getId() {
        return id;
    }

    public String getSlug() {
        return slug;
    }

    public String getDisplayName() {
        return displayName;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void touch(Instant at) {
        this.updatedAt = at;
    }
}
