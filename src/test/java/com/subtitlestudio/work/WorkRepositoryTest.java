package com.subtitlestudio.work;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
class WorkRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-10T10:00:00Z");

    @Autowired
    private WorkRepository works;

    @Autowired
    private PersonRepository people;

    @Autowired
    private TestEntityManager em;

    @Autowired
    private JdbcTemplate jdbc;

    private Work work(String title, LocalDate release, List<Person> cast) {
        Work w = new Work(NOW);
        List<WorkCredit> credits = new java.util.ArrayList<>();
        for (int i = 0; i < cast.size(); i++) {
            credits.add(new WorkCredit(w, i + 1, cast.get(i), "Lead", "Key"));
        }
        List<WorkLink> links = List.of(new WorkLink(w, 1, LinkKind.PILOT, "Pilot", "https://youtu.be/dQw4w9WgXcQ", null));
        w.set(title, null, release, WorkCategory.FILM_TV, "Drama", null, null, links, credits, NOW);
        return works.saveAndFlush(w);
    }

    @Test
    void sortsComingSoonFirstThenNewest() {
        Work old = work("Old", LocalDate.parse("2026-01-05"), List.of());
        Work newer = work("Newer", LocalDate.parse("2026-11-09"), List.of());
        Work soon = work("Soon", null, List.of());
        Work sameDayLater = work("Same day later", LocalDate.parse("2026-11-09"), List.of());
        em.clear();

        assertThat(works.findAllSorted()).extracting(Work::getId)
                .containsExactly(soon.getId(), sameDayLater.getId(), newer.getId(), old.getId());
    }

    @Test
    void deletingWorkCascadesLinksAndCreditsButKeepsThePerson() {
        Person bonnie = people.saveAndFlush(new Person("Bonnie", null, NOW));
        Work w = work("Love Story", LocalDate.parse("2026-04-24"), List.of(bonnie));
        em.clear();

        works.delete(works.findById(w.getId()).orElseThrow());
        works.flush();

        assertThat(jdbc.queryForObject("select count(*) from t_work_link", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from t_work_credit", Integer.class)).isZero();
        assertThat(people.findById(bonnie.getId())).isPresent();
    }

    @Test
    void keepsLinksAndCreditsInPositionOrderAndFindsCrediting() {
        Person emi = people.saveAndFlush(new Person("Emi", null, NOW));
        Person bonnie = people.saveAndFlush(new Person("Bonnie", null, NOW));
        Work w = work("B work", LocalDate.parse("2026-04-24"), List.of(bonnie, emi));
        work("A work", LocalDate.parse("2026-04-25"), List.of(emi));
        em.clear();

        Work loaded = works.findById(w.getId()).orElseThrow();
        assertThat(loaded.getCredits()).extracting(c -> c.getPerson().getName()).containsExactly("Bonnie", "Emi");
        assertThat(works.titlesCrediting(emi)).containsExactly("A work", "B work");
        assertThat(works.titlesCrediting(bonnie)).containsExactly("B work");
        assertThat(people.findByNameIgnoreCase("bonNIE")).isPresent();
        assertThat(people.findAllByOrderByNameAsc()).extracting(Person::getName).containsExactly("Bonnie", "Emi");
    }
}
