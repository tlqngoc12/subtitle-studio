package com.subtitlestudio.work;

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
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;

/** One button on a work's page. {@code icon} is an explicit icon key, or null to detect it from the URL. */
@Entity
@Table(name = "t_work_link")
public class WorkLink {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_work_link_seq")
    @SequenceGenerator(name = "t_work_link_seq", sequenceName = "t_work_link_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "work_id", nullable = false)
    private Work work;

    @Column(nullable = false)
    private int position;

    @Enumerated(EnumType.STRING)
    @Column(length = 10, nullable = false)
    private LinkKind kind;

    @Column(length = 60, nullable = false)
    private String label;

    @Column(length = 500, nullable = false)
    private String url;

    @Column(length = 30)
    private String icon;

    protected WorkLink() {
        // for JPA
    }

    public WorkLink(Work work, int position, LinkKind kind, String label, String url, String icon) {
        this.work = work;
        this.position = position;
        this.kind = kind;
        this.label = label;
        this.url = url;
        this.icon = icon;
    }

    public Long getId() {
        return id;
    }

    public int getPosition() {
        return position;
    }

    public LinkKind getKind() {
        return kind;
    }

    public String getLabel() {
        return label;
    }

    public String getUrl() {
        return url;
    }

    public String getIcon() {
        return icon;
    }
}
