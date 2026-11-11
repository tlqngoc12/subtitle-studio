package com.subtitlestudio.photo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class InstagramUrlTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "https://www.instagram.com/p/DQx1abc/|https://www.instagram.com/p/DQx1abc/",
            "https://instagram.com/p/DQx1abc?igsh=xyz|https://www.instagram.com/p/DQx1abc/",
            "https://m.instagram.com/reel/C9_k-2/?utm_source=ig_web|https://www.instagram.com/reel/C9_k-2/",
            "https://www.instagram.com/emiamily/p/DQx1abc/|https://www.instagram.com/p/DQx1abc/",
            "'  https://www.instagram.com/tv/AbC123/#x  '|https://www.instagram.com/tv/AbC123/",
            "https://www.instagram.com/p/DQx1abc/?igsh=xyz|https://www.instagram.com/p/DQx1abc/",
            "instagram.com/emiamily/p/DQx1abc|https://www.instagram.com/p/DQx1abc/",
    })
    void normalisesShareLinks(String raw, String expected) {
        assertThat(InstagramUrl.normalize(raw)).contains(expected);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
            "", "https://www.instagram.com/emiamily/", "https://evil.com/p/DQx1abc/",
            "https://www.instagram.com.evil.com/p/x/", "ftp://instagram.com/p/x/", "not a url",
            "https://www.instagram.com/p/", "https://www.instagram.com/stories/a/b/",
    })
    void rejectsEverythingElse(String raw) {
        assertThat(InstagramUrl.normalize(raw)).isEqualTo(Optional.empty());
    }
}
