package com.subtitlestudio.work;

import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.Profile;
import jakarta.persistence.CascadeType;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
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
import jakarta.persistence.OrderColumn;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.ListIndexBase;
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

    // One to eight categories in the order the admin chose them; position runs 1..n (V16).
    @ElementCollection
    @CollectionTable(name = "t_work_category", joinColumns = @JoinColumn(name = "work_id"))
    @OrderColumn(name = "position")
    @ListIndexBase(1)
    @Column(name = "category", length = 20, nullable = false)
    @Enumerated(EnumType.STRING)
    @Fetch(FetchMode.SUBSELECT)
    private List<WorkCategory> categories = new ArrayList<>();

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
    public void set(String title, Media cover, LocalDate releaseDate, List<WorkCategory> categories, String subcategory,
                    Profile profile, String description, List<WorkLink> newLinks, List<WorkCredit> newCredits,
                    Instant now) {
        this.title = title;
        this.cover = cover;
        this.releaseDate = releaseDate;
        // A new list, not clear + addAll: Hibernate then deletes every row before inserting, so reordering never
        // collides with the (work_id, category) key.
        this.categories = new ArrayList<>(categories);
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

    public List<WorkCategory> getCategories() {
        return categories;
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
