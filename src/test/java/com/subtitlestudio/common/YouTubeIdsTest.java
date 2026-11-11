package com.subtitlestudio.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class YouTubeIdsTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "https://youtu.be/dQw4w9WgXcQ?si=abc",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30",
            "https://youtube.com/shorts/dQw4w9WgXcQ",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "  youtu.be/dQw4w9WgXcQ  ",
            "dQw4w9WgXcQ",
    })
    void findsTheVideoId(String url) {
        assertThat(YouTubeIds.videoId(url)).contains("dQw4w9WgXcQ");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
            "", "https://vimeo.com/123", "https://youtube.com/@gmmtv", "https://youtu.be/short",
            "javascript:alert(1)",
    })
    void rejectsEverythingElse(String url) {
        assertThat(YouTubeIds.videoId(url)).isEqualTo(Optional.empty());
    }
}
