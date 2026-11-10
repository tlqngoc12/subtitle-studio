package com.subtitlestudio.work;

import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.Profile;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** One work (film, MV, ad...) with its link buttons and credits; both lists are replaced as a whole on save. */
@Entity
@Table(name = "t_work")
public class Work {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_work_seq")
    @SequenceGenerator(name = "t_work_seq", sequenceName = "t_work_seq", allocationSize = 50)
    private Long id;

    @Column(length = 200, nullable = false)
    private String title;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cover_media_id")
    private Media cover;

    // Oracle DATE and H2 (MODE=Oracle) DATE both come back as TIMESTAMP; only the day is used.
    @JdbcTypeCode(SqlTypes.TIMESTAMP)
    @Column(name = "release_date")
    private LocalDate releaseDate;

    @Enumerated(EnumType.STRING)
    @Column(length = 20, nullable = false)
    private WorkCategory category;

    @Column(length = 50)
    private String subcategory;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id")
    private Profile profile;

    @Column(length = 2000)
    private String description;

    @OneToMany(mappedBy = "work", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position")
    private List<WorkLink> links = new ArrayList<>();

    @OneToMany(mappedBy = "work", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position")
    private List<WorkCredit> credits = new ArrayList<>();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Work() {
        // for JPA
    }

    public Work(Instant now) {
        this.createdAt = now;
        this.updatedAt = now;
    }

    /** Replaces every field and both lists; {@code newLinks} and {@code newCredits} are built with this work. */
    public void set(String title, Media cover, LocalDate releaseDate, WorkCategory category, String subcategory,
                    Profile profile, String description, List<WorkLink> newLinks, List<WorkCredit> newCredits,
                    Instant now) {
        this.title = title;
        this.cover = cover;
        this.releaseDate = releaseDate;
        this.category = category;
        this.subcategory = subcategory;
        this.profile = profile;
        this.description = description;
        this.links.clear();
        this.links.addAll(newLinks);
        this.credits.clear();
        this.credits.addAll(newCredits);
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public Media getCover() {
        return cover;
    }

    public LocalDate getReleaseDate() {
        return releaseDate;
    }

    public WorkCategory getCategory() {
        return category;
    }

    public String getSubcategory() {
        return subcategory;
    }

    public Profile getProfile() {
        return profile;
    }

    public String getDescription() {
        return description;
    }

    public List<WorkLink> getLinks() {
        return links;
    }

    public List<WorkCredit> getCredits() {
        return credits;
    }
}
