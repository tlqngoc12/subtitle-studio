package com.subtitlestudio.fanfic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
class FanficRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-11T10:00:00Z");

    @Autowired
    private FanficRepository fanfics;

    @Autowired
    private TestEntityManager em;

    private Fanfic story(String wattpadId, Instant updated) {
        Fanfic f = new Fanfic(NOW);
        f.set(wattpadId, WattpadLink.canonicalUrl(wattpadId), "Story " + wattpadId, "emibonnie", "About it",
                "gl romance", null, null, 51029, 2167, 28, 15739, true, updated, NOW);
        return fanfics.saveAndFlush(f);
    }

    @Test
    void findsByWattpadIdAndOrdersByStoryUpdate() {
        Fanfic old = story("1", Instant.parse("2026-01-01T00:00:00Z"));
        Fanfic fresh = story("2", Instant.parse("2026-11-01T00:00:00Z"));
        Fanfic sameLater = story("3", Instant.parse("2026-11-01T00:00:00Z"));
        em.clear();

        assertThat(fanfics.findAllByOrderByStoryUpdatedAtDescIdDesc()).extracting(Fanfic::getId)
                .containsExactly(sameLater.getId(), fresh.getId(), old.getId());
        Fanfic loaded = fanfics.findByWattpadId("2").orElseThrow();
        assertThat(loaded.getReadCount()).isEqualTo(51029);
        assertThat(loaded.isCompleted()).isTrue();
        assertThat(fanfics.findByWattpadId("999")).isEmpty();
    }

    @Test
    void wattpadIdIsUnique() {
        story("1", NOW);

        assertThatThrownBy(() -> story("1", NOW)).isInstanceOf(DataIntegrityViolationException.class);
    }
}
