package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class MediaNamesTest {

    private static Media media(String name, String type) {
        return new Media(type, 1, name, Instant.parse("2026-11-12T20:30:00Z"));
    }

    @Test
    void slugFoldsVietnameseDiacriticsAndDropsTheExtension() {
        assertThat(MediaNames.slug("Ảnh Đẹp Việt Nam.JPG")).isEqualTo("anh-dep-viet-nam");
        assertThat(MediaNames.slug("Emi  Instagram_post (3).png")).isEqualTo("emi-instagram-post-3");
    }

    @Test
    void thaiOnlyNamesBecomeEmptyAndMixedNamesKeepTheirAscii() {
        assertThat(MediaNames.slug("ภาพสวย.png")).isEmpty();
        assertThat(MediaNames.slug("ภาพ-cover-สวย.png")).isEqualTo("cover");
    }

    @Test
    void slugOfNullOrBlankIsEmpty() {
        assertThat(MediaNames.slug(null)).isEmpty();
        assertThat(MediaNames.slug("  ")).isEmpty();
        assertThat(MediaNames.slug("...png")).isEmpty();
    }

    @Test
    void longNamesAreCutAt60CharsWithoutATrailingDash() {
        String name = "word-".repeat(30) + ".png";

        String slug = MediaNames.slug(name);

        assertThat(slug.length()).isLessThanOrEqualTo(60);
        assertThat(slug).doesNotEndWith("-").startsWith("word-word");
    }

    @Test
    void fileNameUsesVietnamTimeDateAndFirstEightKeyChars() {
        Media m = media("Emi Instagram Post.webp", "image/webp");

        // 20:30 UTC on the 12th is 03:30 on the 13th in Ho Chi Minh City.
        assertThat(MediaNames.fileName(m, "photo"))
                .isEqualTo("2026-11-13_emi-instagram-post_" + m.getStorageKey().substring(0, 8) + ".webp");
    }

    @Test
    void emptySlugFallsBackToTheCategoryWord() {
        Media m = media("ภาพ.jpg", "image/jpeg");

        assertThat(MediaNames.fileName(m, "portrait")).matches("2026-11-13_portrait_[0-9a-f]{8}\\.jpg");
        assertThat(MediaNames.fileName(media(null, "image/png"), "avatar")).contains("_avatar_");
    }

    @Test
    void collisionSuffixGoesBeforeTheExtension() {
        assertThat(MediaNames.withSuffix("a_b.png", 2)).isEqualTo("a_b-2.png");
        assertThat(MediaNames.withSuffix("a_b.png", 3)).isEqualTo("a_b-3.png");
    }

    @Test
    void folderNamesAreSafeAndFallBack() {
        assertThat(MediaNames.folder("My Novel!", "novel")).isEqualTo("my-novel");
        assertThat(MediaNames.folder("../..", "novel")).isEqualTo("novel");
        assertThat(MediaNames.folder(null, "novel")).isEqualTo("novel");
    }
}
