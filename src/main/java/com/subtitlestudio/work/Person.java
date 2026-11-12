package com.subtitlestudio.work;

import com.subtitlestudio.profile.Media;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;
import java.time.Instant;

/** An entry of the people directory: a name and an optional avatar, reused across works. */
@EntityListeners(com.subtitlestudio.profile.MediaReferenceListener.class)
@Entity
@Table(name = "t_person")
public class Person {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_person_seq")
    @SequenceGenerator(name = "t_person_seq", sequenceName = "t_person_seq", allocationSize = 50)
    private Long id;

    @Column(length = 100, nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "avatar_media_id")
    private Media avatar;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Person() {
        // for JPA
    }

    public Person(String name, Media avatar, Instant now) {
        this.name = name;
        this.avatar = avatar;
        this.createdAt = now;
    }

    public void set(String name, Media avatar) {
        this.name = name;
        this.avatar = avatar;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public Media getAvatar() {
        return avatar;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
