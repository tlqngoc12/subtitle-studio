package com.subtitlestudio.fanfic;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class WattpadLinkTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "https://www.wattpad.com/story/396487502-the-way-she-warmed-me-emibonnie|396487502",
            "https://wattpad.com/story/396487502|396487502",
            "https://m.wattpad.com/story/396487502-x?utm_source=ios|396487502",
            "http://www.wattpad.com/story/12345#top|12345",
            "  https://www.wattpad.com/story/77-a/  |77"})
    void extractsStoryId(String url, String id) {
        assertThat(WattpadLink.storyId(url)).isEqualTo(Optional.of(id));
        assertThat(WattpadLink.isChapterLink(url)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://www.wattpad.com.evil.com/story/1", "ftp://wattpad.com/story/1", "wattpad", "",
            "https://example.com/story/1", "https://www.wattpad.com/story/abc", "https://www.wattpad.com/user/someone"})
    @NullSource
    void rejectsOtherLinks(String url) {
        assertThat(WattpadLink.storyId(url)).isEmpty();
        assertThat(WattpadLink.isChapterLink(url)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://www.wattpad.com/1550000000-chapter-slug", "https://m.wattpad.com/1550000000"})
    void recognisesChapterLinks(String url) {
        assertThat(WattpadLink.storyId(url)).isEmpty();
        assertThat(WattpadLink.isChapterLink(url)).isTrue();
    }

    @Test
    void canonicalUrlUsesTheStoryId() {
        assertThat(WattpadLink.canonicalUrl("396487502")).isEqualTo("https://www.wattpad.com/story/396487502");
    }
}
