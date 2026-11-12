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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest
@ActiveProfiles("test")
class ProfileBannerServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-09T10:00:00Z");
    private static final Path DATA_DIR;

    static {
        try {
            DATA_DIR = Files.createTempDirectory("subtitle-studio-banner-test");
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
    private ProfileBannerService banner;

    @Autowired
    private ProfileService profiles;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private MediaRepository media;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private MutableClock clock;

    private final Map<Long, String> keys = new HashMap<>();

    @BeforeEach
    void setUp() {
        clock.reset();
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("delete from t_profile_banner_image");
        jdbc.update("delete from t_profile_block_item");
        jdbc.update("delete from t_profile_block");
        media.deleteAll();
    }

    private long image() {
        Media m = mediaService.store("a.png", ImageSnifferTest.PNG);
        keys.put(m.getId(), m.getStorageKey());
        return m.getId();
    }

    private Path fileOf(long id) {
        return com.subtitlestudio.test.MediaTestFiles.fileOf(DATA_DIR, keys.get(id));
    }

    private BannerImageDto add(String slug, String alt) {
        List<BannerImageDto> list = banner.add(slug, new BannerImageRequest(image(), alt));
        return list.get(list.size() - 1);
    }

    private List<Long> ids(String slug) {
        return profiles.get(slug).banner().stream().map(BannerImageDto::id).toList();
    }

    private static List<String> fields(InvalidBlockException e) {
        return e.errors().stream().map(FieldError::field).toList();
    }

    @Test
    void addAppendsInOrderAndProfileDtoCarriesTheBanner() {
        clock.advance(Duration.ofMinutes(5));
        long m1 = image();
        long m2 = image();
        banner.add("emi", new BannerImageRequest(m1, "First"));
        List<BannerImageDto> list = banner.add("emi", new BannerImageRequest(m2, null));

        assertThat(list).extracting(BannerImageDto::altText).containsExactly("First", null);
        assertThat(list).extracting(BannerImageDto::mediaUrl).containsExactly("/api/media/" + m1, "/api/media/" + m2);
        ProfileDto emi = profiles.get("emi");
        assertThat(emi.banner()).isEqualTo(list);
        assertThat(emi.updatedAt()).isEqualTo(NOW.plus(Duration.ofMinutes(5)));
        assertThat(profiles.get("bonnie").banner()).isEmpty();
    }

    @Test
    void bannerDtoDoesNotSerialiseTheMediaId() throws Exception {
        long m = image();
        BannerImageDto dto = banner.add("emi", new BannerImageRequest(m, "x")).get(0);

        String json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(dto);

        assertThat(json).contains("\"mediaUrl\"").contains("\"altText\"").doesNotContain("mediaId");
    }

    @Test
    void altTextIsOptionalTrimmedAndBlankBecomesNull() {
        assertThat(add("emi", "  Fan meeting  ").altText()).isEqualTo("Fan meeting");
        assertThat(add("emi", "   ").altText()).isNull();
        assertThat(add("emi", "").altText()).isNull();
        assertThat(add("emi", null).altText()).isNull();
        assertThat(jdbc.queryForObject("select count(*) from t_profile_banner_image where alt_text is null",
                Integer.class)).isEqualTo(3);
    }

    @Test
    void altTextOfExactly200CharactersIsAcceptedAndMoreIsRejected() {
        String max = "ภ".repeat(200);
        assertThat(add("emi", max).altText()).isEqualTo(max);

        long m = image();
        InvalidBlockException e = catchThrowableOfType(InvalidBlockException.class,
                () -> banner.add("emi", new BannerImageRequest(m, "a".repeat(201))));

        assertThat(e).isNotNull();
        assertThat(fields(e)).containsExactly("altText");
        assertThat(ids("emi")).hasSize(1);
    }

    @Test
    void ninthImageIsRejectedByTheService() {
        for (int i = 0; i < 8; i++) {
            add("emi", "img " + i);
        }
        long m = image();

        InvalidBlockException e = catchThrowableOfType(InvalidBlockException.class,
                () -> banner.add("emi", new BannerImageRequest(m, null)));

        assertThat(e).isNotNull();
        assertThat(fields(e)).containsExactly("banner");
        assertThat(ids("emi")).hasSize(8);
        assertThat(ids("bonnie")).isEmpty();
        assertThat(add("bonnie", null)).isNotNull();
    }

    @Test
    void unknownOrMissingMediaIsRejected() {
        InvalidBlockException unknown = catchThrowableOfType(InvalidBlockException.class,
                () -> banner.add("emi", new BannerImageRequest(999_999L, null)));
        InvalidBlockException missing = catchThrowableOfType(InvalidBlockException.class,
                () -> banner.add("emi", new BannerImageRequest(null, null)));

        assertThat(fields(unknown)).containsExactly("mediaId");
        assertThat(fields(missing)).containsExactly("mediaId");
        assertThat(ids("emi")).isEmpty();
    }

    @Test
    void unknownProfileIsNotFound() {
        assertThatThrownBy(() -> banner.add("nobody", new BannerImageRequest(image(), null)))
                .isInstanceOf(ProfileNotFoundException.class);
        assertThatThrownBy(() -> banner.reorder("nobody", List.of())).isInstanceOf(ProfileNotFoundException.class);
    }

    @Test
    void editChangesTheAltTextTrimsAndBlankClearsIt() {
        long id = add("emi", "Old").id();

        assertThat(banner.updateAltText("emi", id, "  New  ").get(0).altText()).isEqualTo("New");
        assertThat(banner.updateAltText("emi", id, "   ").get(0).altText()).isNull();
        assertThat(profiles.get("emi").banner().get(0).altText()).isNull();
    }

    @Test
    void editRejectsMoreThan200CharactersAndKeepsTheOldValue() {
        long id = add("emi", "Old").id();

        InvalidBlockException e = catchThrowableOfType(InvalidBlockException.class,
                () -> banner.updateAltText("emi", id, "a".repeat(201)));

        assertThat(fields(e)).containsExactly("altText");
        assertThat(profiles.get("emi").banner().get(0).altText()).isEqualTo("Old");
    }

    @Test
    void imageOfAnotherProfileIsNotFoundOnEditAndDelete() {
        long id = add("emi", "x").id();

        assertThatThrownBy(() -> banner.updateAltText("bonnie", id, "y"))
                .isInstanceOf(BannerImageNotFoundException.class);
        assertThatThrownBy(() -> banner.delete("bonnie", id)).isInstanceOf(BannerImageNotFoundException.class);
        assertThatThrownBy(() -> banner.delete("emi", 999_999L)).isInstanceOf(BannerImageNotFoundException.class);
        assertThat(ids("emi")).containsExactly(id);
    }

    @Test
    void deleteKeepsPositionsGaplessAndRemovesTheUnusedMedia() {
        long a = add("emi", "a").id();
        long b = add("emi", "b").id();
        long c = add("emi", "c").id();
        long mediaOfB = jdbc.queryForObject("select media_id from t_profile_banner_image where id = ?", Long.class, b);

        List<BannerImageDto> after = banner.delete("emi", b);

        assertThat(after).extracting(BannerImageDto::id).containsExactly(a, c);
        assertThat(jdbc.queryForList("select position from t_profile_banner_image order by position", Integer.class))
                .containsExactly(1, 2);
        assertThat(media.existsById(mediaOfB)).isFalse();
        assertThat(fileOf(mediaOfB)).doesNotExist();
        assertThat(media.count()).isEqualTo(2);
    }

    @Test
    void deleteKeepsMediaThatAnotherProfileStillShows() {
        long shared = image();
        banner.add("emi", new BannerImageRequest(shared, null));
        banner.add("bonnie", new BannerImageRequest(shared, null));
        long first = ids("emi").get(0);

        banner.delete("emi", first);

        assertThat(media.existsById(shared)).isTrue();
        assertThat(fileOf(shared)).exists();
        assertThat(ids("bonnie")).hasSize(1);
    }

    @Test
    void appendAfterDeleteContinuesGapless() {
        add("emi", "a");
        long b = add("emi", "b").id();
        banner.delete("emi", ids("emi").get(0));
        add("emi", "c");

        assertThat(jdbc.queryForList("select position from t_profile_banner_image order by position", Integer.class))
                .containsExactly(1, 2);
        assertThat(ids("emi").get(0)).isEqualTo(b);
    }

    @Test
    void reorderRewritesGaplessPositions() {
        long a = add("emi", "a").id();
        long b = add("emi", "b").id();
        long c = add("emi", "c").id();

        List<BannerImageDto> result = banner.reorder("emi", List.of(c, a, b));

        assertThat(result).extracting(BannerImageDto::id).containsExactly(c, a, b);
        assertThat(ids("emi")).containsExactly(c, a, b);
        assertThat(jdbc.queryForList("select position from t_profile_banner_image order by position", Integer.class))
                .containsExactly(1, 2, 3);
    }

    @Test
    void reorderWithABadListIsRejectedAndNothingChanges() {
        long a = add("emi", "a").id();
        long b = add("emi", "b").id();
        long other = add("bonnie", "z").id();
        List<List<Long>> bad = List.of(List.of(a), List.of(a, a), List.of(a, b, b), List.of(a, other),
                List.of(a, b, other), List.of(b, 999_999L), List.of());

        for (List<Long> list : bad) {
            InvalidBlockException e = catchThrowableOfType(InvalidBlockException.class,
                    () -> banner.reorder("emi", list));
            assertThat(e).as("list %s", list).isNotNull();
            assertThat(fields(e)).containsExactly("imageIds");
        }
        assertThatThrownBy(() -> banner.reorder("emi", null)).isInstanceOf(InvalidBlockException.class);
        assertThat(ids("emi")).containsExactly(a, b);
        assertThat(ids("bonnie")).containsExactly(other);
    }

    @Test
    void failedAddKeepsTheUploadedMedia() {
        long m = image();

        assertThatThrownBy(() -> banner.add("emi", new BannerImageRequest(m, "a".repeat(201))))
                .isInstanceOf(InvalidBlockException.class);

        assertThat(media.existsById(m)).isTrue();
        assertThat(fileOf(m)).exists();
    }

    @Test
    void bannerImagesAreNotAbandonedUploads() {
        long shown = image();
        long stray = image();
        banner.add("emi", new BannerImageRequest(shown, null));
        clock.advance(Duration.ofDays(2));

        int deleted = mediaService.deleteUnreferencedOlderThan(Duration.ofHours(24));

        assertThat(deleted).isEqualTo(1);
        assertThat(media.existsById(shown)).isTrue();
        assertThat(media.existsById(stray)).isFalse();
    }
}
