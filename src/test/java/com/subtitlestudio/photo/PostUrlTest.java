package com.subtitlestudio.photo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class PostUrlTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "https://www.instagram.com/p/DQx1abc/|https://www.instagram.com/p/DQx1abc/",
            "https://instagram.com/p/DQx1abc?igsh=xyz|https://www.instagram.com/p/DQx1abc/",
            "https://m.instagram.com/reel/C9_k-2/?utm_source=ig_web|https://www.instagram.com/reel/C9_k-2/",
            "https://www.instagram.com/emiamily/p/DQx1abc/|https://www.instagram.com/p/DQx1abc/",
            "'  https://www.instagram.com/tv/AbC123/#x  '|https://www.instagram.com/tv/AbC123/",
            "https://www.instagram.com/p/DQx1abc/?igsh=xyz|https://www.instagram.com/p/DQx1abc/",
            "instagram.com/emiamily/p/DQx1abc|https://www.instagram.com/p/DQx1abc/",
            "https://x.com/EmiAmily/status/1850000000000000001|https://x.com/EmiAmily/status/1850000000000000001",
            "https://www.x.com/emi/status/123?s=20&t=abc|https://x.com/emi/status/123",
            "https://twitter.com/emi/status/123|https://x.com/emi/status/123",
            "https://www.twitter.com/emi/status/123/|https://x.com/emi/status/123",
            "https://mobile.twitter.com/emi_x/status/123#frag|https://x.com/emi_x/status/123",
            "https://x.com/emi/status/123/photo/2|https://x.com/emi/status/123",
            "https://x.com/emi/status/123/video/1?x=1|https://x.com/emi/status/123",
            "'  x.com/emi/status/123  '|https://x.com/emi/status/123",
    })
    void normalisesShareLinks(String raw, String expected) {
        assertThat(PostUrl.normalize(raw)).contains(expected);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
            "", "https://www.instagram.com/emiamily/", "https://evil.com/p/DQx1abc/",
            "https://www.instagram.com.evil.com/p/x/", "ftp://instagram.com/p/x/", "not a url",
            "https://www.instagram.com/p/", "https://www.instagram.com/stories/a/b/",
            "https://x.com.evil.com/emi/status/123", "https://evilx.com/emi/status/123", "https://x.com/emi",
            "https://x.com/emi/status/abc", "https://x.com/emi/status/123/likes", "https://x.com/emi/status/123/photo/x",
            "https://x.com/emi/status/123/photo/1/extra", "https://x.com/i/status/", "https://x.com/emi/with_replies/123",
            "https://x.com/em i/status/123", "https://api.twitter.com/emi/status/123",
    })
    void rejectsEverythingElse(String raw) {
        assertThat(PostUrl.normalize(raw)).isEqualTo(Optional.empty());
    }
}
