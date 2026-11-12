package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import com.subtitlestudio.test.MutableClock;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
@ActiveProfiles("test")
class ProfileServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-03T10:00:00Z");
    private static final Path DATA_DIR;

    static {
        try {
            DATA_DIR = Files.createTempDirectory("subtitle-studio-profile-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    @TestConfiguration
    static class Config {
        @Bean
        @Primary
        MutableClock testClock() {
            return new MutableClock(NOW);
        }
    }

    @Autowired
    private ProfileService service;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private MediaRepository media;

    @Autowired
    private ProfileBlockRepository blocks;

    @Autowired
    private ProfileRepository profiles;

    @Autowired
    private ProfileBannerImageRepository bannerImages;

    @Autowired
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Autowired
    private MutableClock clock;

    @BeforeEach
    void setUp() {
        clock.reset();
    }

    @AfterEach
    void cleanUp() {
        blocks.deleteAll();
        bannerImages.deleteAll();
        jdbc.update("delete from t_profile where kind = 'MEMBER' and slug not in ('emi', 'bonnie')");
        jdbc.update("update t_profile set portrait_media_id = null, tagline = null, full_name = null, "
                + "display_name = case slug when 'emibonnie' then 'EmiBonnie' when 'emi' then 'Emi' else 'Bonnie' end, "
                + "sort_order = case slug when 'emibonnie' then 0 when 'emi' then 1 else 2 end");
        media.deleteAll();
    }

    /** Storage key of each image this test uploaded, so files can be checked after their row is gone. */
    private final java.util.Map<Long, String> keys = new java.util.HashMap<>();

    private long image() {
        Media m = mediaService.store("a.png", ImageSnifferTest.PNG);
        keys.put(m.getId(), m.getStorageKey());
        return m.getId();
    }

    private Path fileOf(long id) {
        return com.subtitlestudio.test.MediaTestFiles.fileOf(DATA_DIR, keys.get(id));
    }

    private static BlockRequest text(String body) {
        return new BlockRequest(BlockType.TEXT, null, body, null, null, null, null);
    }

    private static BlockRequest imageBlock(long mediaId) {
        return new BlockRequest(BlockType.IMAGE, null, null, mediaId, "cap", null, null);
    }

    private static BlockRequest gallery(long... mediaIds) {
        List<ItemRequest> items = java.util.Arrays.stream(mediaIds).mapToObj(id -> new ItemRequest(null, null, id))
                .toList();
        return new BlockRequest(BlockType.GALLERY, null, null, null, null, null, items);
    }

    private static BlockRequest links(int n) {
        List<ItemRequest> items = java.util.stream.IntStream.rangeClosed(1, n)
                .mapToObj(i -> new ItemRequest("L" + i, "https://l" + i + ".example", null)).toList();
        return new BlockRequest(BlockType.LINKS, "Links", null, null, null, null, items);
    }

    private List<Long> ids(String slug) {
        return service.get(slug).blocks().stream().map(BlockDto::id).toList();
    }

    @Test
    void listsProfilesInSeedOrder() {
        ProfilePageDto page = service.page();
        assertThat(page.group().slug()).isEqualTo("emibonnie");
        assertThat(page.members()).extracting(ProfileDto::slug).containsExactly("emi", "bonnie");
    }

    @Test
    void getUnknownSlugThrows() {
        assertThatThrownBy(() -> service.get("nobody")).isInstanceOf(ProfileNotFoundException.class);
        assertThatThrownBy(() -> service.addBlock("nobody", text("x"))).isInstanceOf(ProfileNotFoundException.class);
    }

    @Test
    void addAppendsAtEnd() {
        clock.advance(Duration.ofMinutes(5));
        BlockDto a = service.addBlock("emi", text("A"));
        BlockDto b = service.addBlock("emi", text("B"));

        ProfileDto emi = service.get("emi");
        assertThat(emi.blocks()).extracting(BlockDto::body).containsExactly("A", "B");
        assertThat(emi.blocks()).extracting(BlockDto::id).containsExactly(a.id(), b.id());
        assertThat(emi.updatedAt()).isEqualTo(NOW.plus(Duration.ofMinutes(5)));
        assertThat(service.get("bonnie").blocks()).isEmpty();
    }

    @Test
    void blockDtoHasMediaUrls() {
        long img = image();
        long g1 = image();
        BlockDto image = service.addBlock("emi", imageBlock(img));
        BlockDto gal = service.addBlock("emi", gallery(g1));

        assertThat(image.mediaId()).isEqualTo(img);
        assertThat(image.mediaUrl()).isEqualTo("/api/media/" + img);
        assertThat(image.caption()).isEqualTo("cap");
        assertThat(gal.items()).containsExactly(new ItemDto(null, null, g1, "/api/media/" + g1));
        assertThat(service.get("emi").blocks().get(1).items().get(0).mediaUrl()).isEqualTo("/api/media/" + g1);
    }

    @Test
    void updateReplacesContentAndItems() {
        BlockDto block = service.addBlock("emi", links(3));

        BlockDto updated = service.updateBlock("emi", block.id(), links(1));

        assertThat(updated.items()).hasSize(1);
        assertThat(service.get("emi").blocks().get(0).items())
                .containsExactly(new ItemDto("L1", "https://l1.example", null, null));
    }

    @Test
    void updateCannotChangeType() {
        long img = image();
        BlockDto block = service.addBlock("emi", text("x"));

        InvalidBlockException e = catchThrowableOfType(InvalidBlockException.class,
                () -> service.updateBlock("emi", block.id(), imageBlock(img)));

        assertThat(e).isNotNull();
        assertThat(e.errors()).extracting(FieldError::field).containsExactly("type");
    }

    @Test
    void blockOfOtherProfileNotFound() {
        BlockDto block = service.addBlock("emi", text("x"));

        assertThatThrownBy(() -> service.updateBlock("bonnie", block.id(), text("y")))
                .isInstanceOf(BlockNotFoundException.class);
        assertThatThrownBy(() -> service.deleteBlock("bonnie", block.id())).isInstanceOf(BlockNotFoundException.class);
        assertThatThrownBy(() -> service.move("bonnie", block.id(), Direction.UP))
                .isInstanceOf(BlockNotFoundException.class);
        assertThat(ids("emi")).containsExactly(block.id());
    }

    @Test
    void replacingImageDeletesOldMediaAfterCommit() {
        long a = image();
        long b = image();
        BlockDto block = service.addBlock("emi", imageBlock(a));

        service.updateBlock("emi", block.id(), imageBlock(b));

        assertThat(media.existsById(a)).isFalse();
        assertThat(fileOf(a)).doesNotExist();
        assertThat(media.existsById(b)).isTrue();
        assertThat(fileOf(b)).exists();
    }

    @Test
    void failedUpdateKeepsOldMedia() {
        long a = image();
        BlockDto block = service.addBlock("emi", imageBlock(a));

        assertThatThrownBy(() -> service.updateBlock("emi", block.id(), imageBlock(999_999)))
                .isInstanceOf(InvalidBlockException.class);

        assertThat(media.existsById(a)).isTrue();
        assertThat(fileOf(a)).exists();
        assertThat(service.get("emi").blocks().get(0).mediaId()).isEqualTo(a);
    }

    @Test
    void removingGalleryItemDeletesItsImage() {
        long a = image();
        long b = image();
        BlockDto block = service.addBlock("emi", gallery(a, b));

        service.updateBlock("emi", block.id(), gallery(b));

        assertThat(media.existsById(a)).isFalse();
        assertThat(fileOf(a)).doesNotExist();
        assertThat(fileOf(b)).exists();
    }

    @Test
    void deleteBlockDeletesItsImages() {
        long a = image();
        long b = image();
        BlockDto image = service.addBlock("emi", imageBlock(a));
        BlockDto gal = service.addBlock("emi", gallery(b));

        service.deleteBlock("emi", image.id());
        service.deleteBlock("emi", gal.id());

        assertThat(service.get("emi").blocks()).isEmpty();
        assertThat(media.count()).isZero();
        assertThat(fileOf(a)).doesNotExist();
        assertThat(fileOf(b)).doesNotExist();
    }

    @Test
    void sharedImageIsKept() {
        long a = image();
        BlockDto first = service.addBlock("emi", imageBlock(a));
        service.addBlock("bonnie", gallery(a));

        service.deleteBlock("emi", first.id());

        assertThat(media.existsById(a)).isTrue();
        assertThat(fileOf(a)).exists();
    }

    @Test
    void moveSwapsWithNeighbour() {
        long a = service.addBlock("emi", text("a")).id();
        long b = service.addBlock("emi", text("b")).id();
        long c = service.addBlock("emi", text("c")).id();

        assertThat(service.move("emi", b, Direction.UP)).extracting(BlockDto::id).containsExactly(b, a, c);
        assertThat(ids("emi")).containsExactly(b, a, c);
        assertThat(service.move("emi", b, Direction.DOWN)).extracting(BlockDto::id).containsExactly(a, b, c);
    }

    @Test
    void moveAtEdgesIsNoop() {
        long a = service.addBlock("emi", text("a")).id();
        long b = service.addBlock("emi", text("b")).id();

        assertThat(service.move("emi", a, Direction.UP)).extracting(BlockDto::id).containsExactly(a, b);
        assertThat(service.move("emi", b, Direction.DOWN)).extracting(BlockDto::id).containsExactly(a, b);
    }

    private static ProfileHeaderRequest header(String name, String tagline, String fullName, Long portrait) {
        return new ProfileHeaderRequest(name, tagline, fullName, portrait);
    }

    private static List<String> fields(Throwable t) {
        return ((InvalidBlockException) t).errors().stream().map(FieldError::field).toList();
    }

    @Test
    void pageReturnsGroupAndMembersInOrder() {
        ProfilePageDto page = service.page();

        assertThat(page.group().kind()).isEqualTo(ProfileKind.GROUP);
        assertThat(page.members()).extracting(ProfileDto::slug).containsExactly("emi", "bonnie");
    }

    @Test
    void updateHeaderValidatesLengthsAndMedia() {
        assertThat(fields(catchThrowableOfType(InvalidBlockException.class,
                () -> service.updateHeader("emi", header("Emi", "a".repeat(301), null, null)))))
                .containsExactly("tagline");
        assertThat(fields(catchThrowableOfType(InvalidBlockException.class,
                () -> service.updateHeader("emi", header("Emi", null, "a".repeat(201), null)))))
                .containsExactly("fullName");
        assertThat(fields(catchThrowableOfType(InvalidBlockException.class,
                () -> service.updateHeader("emi", header(" ", null, null, null))))).containsExactly("displayName");
        assertThat(fields(catchThrowableOfType(InvalidBlockException.class,
                () -> service.updateHeader("emi", header("Emi", null, null, 999_999L)))))
                .containsExactly("portraitMediaId");
    }

    @Test
    void blankHeaderFieldsStoredAsNull() {
        long img = image();
        ProfileDto saved = service.updateHeader("emi", header(" Emi ", "  ", " Full Name ", img));

        assertThat(saved.displayName()).isEqualTo("Emi");
        assertThat(saved.tagline()).isNull();
        assertThat(saved.fullName()).isEqualTo("Full Name");
        assertThat(saved.portraitMediaId()).isEqualTo(img);
        assertThat(saved.portraitUrl()).isEqualTo("/api/media/" + img);
    }

    @Test
    void replacingPortraitDeletesTheOldUnusedImage() {
        long a = image();
        long b = image();
        service.updateHeader("emi", header("Emi", null, null, a));
        service.updateHeader("emi", header("Emi", null, null, b));

        assertThat(fileOf(a)).doesNotExist();
        assertThat(fileOf(b)).exists();
    }

    @Test
    void addMemberAppendsLast() {
        ProfileDto added = service.addMember(new NewMemberRequest(" Any "));

        assertThat(added.slug()).isEqualTo("any");
        assertThat(added.displayName()).isEqualTo("Any");
        assertThat(added.kind()).isEqualTo(ProfileKind.MEMBER);
        assertThat(service.page().members()).extracting(ProfileDto::slug).containsExactly("emi", "bonnie", "any");
        assertThat(fields(catchThrowableOfType(InvalidBlockException.class,
                () -> service.addMember(new NewMemberRequest(" "))))).containsExactly("displayName");
    }

    @Test
    void deleteMemberRemovesBlocksBannerAndUnusedMedia() {
        long portrait = image();
        long blockImage = image();
        long bannerImage = image();
        ProfileDto any = service.addMember(new NewMemberRequest("Any"));
        service.updateHeader("any", header("Any", null, null, portrait));
        service.addBlock("any", imageBlock(blockImage));
        bannerImages.saveAndFlush(new ProfileBannerImage(profiles.findBySlug("any").orElseThrow(),
                media.getReferenceById(bannerImage), 1, null, NOW));

        service.deleteMember(any.slug());

        assertThat(profiles.existsBySlug("any")).isFalse();
        assertThat(blocks.count()).isZero();
        assertThat(bannerImages.count()).isZero();
        assertThat(fileOf(portrait)).doesNotExist();
        assertThat(fileOf(blockImage)).doesNotExist();
        assertThat(fileOf(bannerImage)).doesNotExist();
    }

    @Test
    void deleteGroupIs409() {
        assertThatThrownBy(() -> service.deleteMember("emibonnie")).isInstanceOf(GroupProfileException.class);
        assertThatThrownBy(() -> service.deleteMember("nobody")).isInstanceOf(ProfileNotFoundException.class);
    }

    @Test
    void reorderMustListEveryMemberOnce() {
        for (List<String> bad : List.of(List.of("emi"), List.of("emi", "emi"), List.of("emi", "bonnie", "x"),
                List.of("emibonnie", "emi", "bonnie"))) {
            assertThat(fields(catchThrowableOfType(InvalidBlockException.class,
                    () -> service.reorder(new MemberOrderRequest(bad))))).containsExactly("slugs");
        }
        List<ProfileDto> reordered = service.reorder(new MemberOrderRequest(List.of("bonnie", "emi")));
        assertThat(reordered).extracting(ProfileDto::slug).containsExactly("bonnie", "emi");
        assertThat(service.page().members()).extracting(ProfileDto::slug).containsExactly("bonnie", "emi");
    }
}
