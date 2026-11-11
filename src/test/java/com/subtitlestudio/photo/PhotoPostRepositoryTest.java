package com.subtitlestudio.photo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.Profile;
import com.subtitlestudio.profile.ProfileRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Set;
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
class PhotoPostRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-10T10:00:00Z");

    @Autowired
    private PhotoPostRepository posts;

    @Autowired
    private MediaRepository media;

    @Autowired
    private ProfileRepository profiles;

    @Autowired
    private TestEntityManager em;

    private PhotoPost post(String code, LocalDate takenOn, Set<Profile> who) {
        Media m = media.save(new Media("image/webp", 10, "a.webp", NOW));
        PhotoPost p = new PhotoPost(NOW);
        p.set("https://www.instagram.com/p/" + code + "/", m, "Post " + code, takenOn, null, PhotoSource.OFFICIAL, 3,
                who, NOW);
        return posts.saveAndFlush(p);
    }

    @Test
    void savesPostWithProfilesAndOrdersByDate() {
        Profile emi = profiles.findBySlug("emi").orElseThrow();
        Profile bonnie = profiles.findBySlug("bonnie").orElseThrow();
        PhotoPost old = post("AAA", LocalDate.parse("2026-11-01"), Set.of(emi));
        PhotoPost sameDayFirst = post("BBB", LocalDate.parse("2026-11-09"), Set.of(emi, bonnie));
        PhotoPost sameDayLater = post("CCC", LocalDate.parse("2026-11-09"), Set.of());
        em.clear();

        assertThat(posts.findAllByOrderByTakenOnDescIdDesc()).extracting(PhotoPost::getId)
                .containsExactly(sameDayLater.getId(), sameDayFirst.getId(), old.getId());
        PhotoPost loaded = posts.findById(sameDayFirst.getId()).orElseThrow();
        assertThat(loaded.getProfiles()).extracting(Profile::getSlug).containsExactlyInAnyOrder("emi", "bonnie");
        assertThat(posts.findByInstagramUrl("https://www.instagram.com/p/AAA/")).isPresent();
    }

    @Test
    void instagramUrlIsUnique() {
        post("AAA", LocalDate.parse("2026-11-01"), Set.of());

        assertThatThrownBy(() -> post("AAA", LocalDate.parse("2026-11-02"), Set.of()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
