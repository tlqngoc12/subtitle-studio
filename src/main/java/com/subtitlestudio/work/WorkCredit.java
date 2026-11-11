package com.subtitlestudio.work;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;

/** A person's part in a work: an optional role and (Film &amp; TV only) the character played. */
@Entity
@Table(name = "t_work_credit")
public class WorkCredit {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "t_work_credit_seq")
    @SequenceGenerator(name = "t_work_credit_seq", sequenceName = "t_work_credit_seq", allocationSize = 50)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "work_id", nullable = false)
    private Work work;

    @Column(nullable = false)
    private int position;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "person_id", nullable = false)
    private Person person;

    @Column(length = 40)
    private String role;

    @Column(name = "character_name", length = 100)
    private String characterName;

    protected WorkCredit() {
        // for JPA
    }

    public WorkCredit(Work work, int position, Person person, String role, String characterName) {
        this.work = work;
        this.position = position;
        this.person = person;
        this.role = role;
        this.characterName = characterName;
    }

    public Long getId() {
        return id;
    }

    public int getPosition() {
        return position;
    }

    public Person getPerson() {
        return person;
    }

    public String getRole() {
        return role;
    }

    public String getCharacterName() {
        return characterName;
    }
}
