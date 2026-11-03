package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.url.UrlParser;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class EmbedUrlResolverTest {

    private static final String YT = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    private static final String TRACK = "4uLU6hMCjMI75M1A2tKUQC";

    private final EmbedUrlResolver resolver = new EmbedUrlResolver(new UrlParser());

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1 | " + YT,
        "https://youtu.be/dQw4w9WgXcQ?t=30                   | " + YT,
        "https://www.youtube.com/shorts/dQw4w9WgXcQ          | " + YT,
        "  https://m.youtube.com/watch?v=dQw4w9WgXcQ         | " + YT,
        YT + "                                               | " + YT,
        "https://open.spotify.com/track/" + TRACK + "?si=abc | https://open.spotify.com/embed/track/" + TRACK,
        "https://open.spotify.com/intl-vi/album/" + TRACK + "| https://open.spotify.com/embed/album/" + TRACK,
        "https://open.spotify.com/intl-pt-br/track/" + TRACK + "| https://open.spotify.com/embed/track/" + TRACK,
        "https://open.spotify.com/playlist/" + TRACK + "     | https://open.spotify.com/embed/playlist/" + TRACK,
        "https://open.spotify.com/artist/" + TRACK + "       | https://open.spotify.com/embed/artist/" + TRACK,
        "https://open.spotify.com/embed/track/" + TRACK + "  | https://open.spotify.com/embed/track/" + TRACK,
    })
    void normalisesToEmbedUrl(String input, String expected) {
        assertThat(resolver.resolve(input)).contains(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "https://evil.com/watch?v=dQw4w9WgXcQ",
        "https://open.spotify.com/episode/" + TRACK,
        "https://open.spotify.com/track/short",
        "javascript:alert(1)",
        "http://open.spotify.com.evil.com/track/" + TRACK,
        "https://www.youtube-nocookie.com/embed/bad",
        "https://vimeo.com/1",
        "ftp://open.spotify.com/track/" + TRACK,
    })
    void rejectsOtherLinks(String input) {
        assertThat(resolver.resolve(input)).isEmpty();
    }

    @ParameterizedTest
    @NullAndEmptySource
    void rejectsMissing(String input) {
        assertThat(resolver.resolve(input)).isEmpty();
    }
}
