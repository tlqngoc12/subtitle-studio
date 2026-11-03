package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
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
class ProfileRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-11-03T10:00:00Z");

    @Autowired
    private ProfileRepository profiles;

    @Autowired
    private ProfileBlockRepository blocks;

    @Autowired
    private MediaRepository media;

    @Autowired
    private TestEntityManager em;

    @Autowired
    private JdbcTemplate jdbc;

    private Profile emi() {
        return profiles.findBySlug("emi").orElseThrow();
    }

    private ProfileBlock block(Profile p, int position, BlockType type) {
        return blocks.saveAndFlush(new ProfileBlock(p, position, type, NOW));
    }

    @Test
    void findsSeededProfileBySlug() {
        assertThat(profiles.findBySlug("emi")).get().extracting(Profile::getDisplayName).isEqualTo("Emi");
        assertThat(profiles.findBySlug("x")).isEmpty();
        assertThat(profiles.findAllByOrderByIdAsc()).extracting(Profile::getSlug)
                .containsExactly("emibonnie", "emi", "bonnie");
    }

    @Test
    void ordersBlocksByPositionThenId() {
        Profile p = emi();
        ProfileBlock a = block(p, 2, BlockType.TEXT);
        ProfileBlock b = block(p, 1, BlockType.TEXT);
        ProfileBlock c = block(p, 1, BlockType.TEXT);
        em.clear();

        assertThat(blocks.findByProfileOrderByPositionAscIdAsc(emi())).extracting(ProfileBlock::getId)
                .containsExactly(b.getId(), c.getId(), a.getId());
    }

    @Test
    void savesItemsInOrderAndCascadesDelete() {
        Profile p = emi();
        ProfileBlock block = new ProfileBlock(p, 1, BlockType.LINKS, NOW);
        block.setContent("Links", null, null, null, null, List.of(
                new ProfileBlockItem(block, 3, "C", "https://c.example", null),
                new ProfileBlockItem(block, 1, "A", "https://a.example", null),
                new ProfileBlockItem(block, 2, "B", "https://b.example", null)), NOW);
        blocks.saveAndFlush(block);
        em.clear();

        ProfileBlock loaded = blocks.findById(block.getId()).orElseThrow();
        assertThat(loaded.getItems()).extracting(ProfileBlockItem::getLabel).containsExactly("A", "B", "C");
        assertThat(loaded.getItems()).extracting(ProfileBlockItem::getValue)
                .containsExactly("https://a.example", "https://b.example", "https://c.example");

        blocks.delete(loaded);
        blocks.flush();
        assertThat(jdbc.queryForObject("select count(*) from t_profile_block_item", Integer.class)).isZero();
    }

    @Test
    void replacingItemsRemovesOrphans() {
        Profile p = emi();
        ProfileBlock block = new ProfileBlock(p, 1, BlockType.FACTS, NOW);
        block.setContent(null, null, null, null, null, List.of(
                new ProfileBlockItem(block, 1, "Ngày sinh", "13/05/1999", null),
                new ProfileBlockItem(block, 2, "Chiều cao", "165", null)), NOW);
        blocks.saveAndFlush(block);

        block.setContent(null, null, null, null, null,
                List.of(new ProfileBlockItem(block, 1, "Biệt danh", "Emi", null)), NOW);
        blocks.saveAndFlush(block);

        assertThat(jdbc.queryForObject("select count(*) from t_profile_block_item", Integer.class)).isEqualTo(1);
    }

    @Test
    void maxPositionIsZeroWhenEmpty() {
        Profile p = emi();
        assertThat(blocks.maxPosition(p)).isZero();
        block(p, 3, BlockType.TEXT);
        assertThat(blocks.maxPosition(p)).isEqualTo(3);
    }

    @Test
    void findsUnreferencedMediaOnly() {
        Instant old = NOW.minusSeconds(3600 * 25);
        Media a = media.save(new Media("image/png", 10, "a.png", old));
        Media b = media.save(new Media("image/png", 10, "b.png", old));
        Media c = media.save(new Media("image/png", 10, "c.png", old));
        media.save(new Media("image/png", 10, "d.png", NOW));

        Profile p = emi();
        ProfileBlock image = new ProfileBlock(p, 1, BlockType.IMAGE, NOW);
        image.setContent(null, null, a, null, null, List.of(), NOW);
        blocks.save(image);
        ProfileBlock gallery = new ProfileBlock(p, 2, BlockType.GALLERY, NOW);
        gallery.setContent(null, null, null, null, null,
                List.of(new ProfileBlockItem(gallery, 1, null, null, b)), NOW);
        blocks.saveAndFlush(gallery);

        assertThat(media.findUnreferencedCreatedBefore(NOW.minusSeconds(3600 * 24)))
                .extracting(Media::getId).containsExactly(c.getId());
        assertThat(media.isReferenced(a.getId())).isTrue();
        assertThat(media.isReferenced(b.getId())).isTrue();
        assertThat(media.isReferenced(c.getId())).isFalse();
    }
}
