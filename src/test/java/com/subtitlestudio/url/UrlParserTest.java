package com.subtitlestudio.url;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class UrlParserTest {

    private static final String ID = "dQw4w9WgXcQ";

    private final UrlParser parser = new UrlParser();

    @ParameterizedTest(name = "[{index}] {0}")
    @ValueSource(strings = {
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG&index=3",
            "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
            "https://youtube.com/watch?v=dQw4w9WgXcQ",
            "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ?si=AbCdEfGh123&t=10",
            "youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://youtube.com/shorts/dQw4w9WgXcQ?feature=share",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ?start=30",
            "https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ",
            "dQw4w9WgXcQ",
            "  https://youtu.be/dQw4w9WgXcQ  \n",
    })
    void extractsVideoIdFromSupportedForms(String input) {
        assertThat(parser.parse(input)).isEqualTo(ID);
    }

    @Test
    void acceptsIdContainingDashAndUnderscore() {
        assertThat(parser.parse("https://youtu.be/a-b_c-d_e-f")).isEqualTo("a-b_c-d_e-f");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\t\n"})
    void rejectsNullOrBlank(String input) {
        assertThatThrownBy(() -> parser.parse(input)).isInstanceOf(InvalidUrlException.class);
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @ValueSource(strings = {
            "dQw4w9WgXc",                                    // 10 chars
            "dQw4w9WgXcQQ",                                  // 12 chars
            "https://youtu.be/dQw4w9WgXc",                   // too short
            "https://www.youtube.com/watch?v=dQw4w9WgXcQQ",  // too long
    })
    void rejectsIdWithWrongLength(String input) {
        assertThatThrownBy(() -> parser.parse(input)).isInstanceOf(InvalidUrlException.class);
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @ValueSource(strings = {
            "dQw4w9WgX;Q",
            "dQw4w9 WgXQ",
            "dQw4w9WgX$Q",
            "https://youtu.be/dQw4w9WgX%3B",
            "https://www.youtube.com/watch?v=dQw4w9W%26rm",
            "--exec=calc",
    })
    void rejectsIdWithIllegalCharacters(String input) {
        assertThatThrownBy(() -> parser.parse(input)).isInstanceOf(InvalidUrlException.class);
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @ValueSource(strings = {
            "https://evil.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
            "https://notyoutu.be/dQw4w9WgXcQ",
            "ftp://www.youtube.com/watch?v=dQw4w9WgXcQ",
    })
    void rejectsNonYoutubeHostOrScheme(String input) {
        assertThatThrownBy(() -> parser.parse(input)).isInstanceOf(InvalidUrlException.class);
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @ValueSource(strings = {
            "https://www.youtube.com/",
            "https://www.youtube.com/watch",
            "https://www.youtube.com/watch?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG",
            "https://www.youtube.com/watch?v=",
            "https://www.youtube.com/shorts/",
            "https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw",
            "https://youtu.be/",
            "not a url at all",
    })
    void rejectsUrlWithoutVideoId(String input) {
        assertThatThrownBy(() -> parser.parse(input)).isInstanceOf(InvalidUrlException.class);
    }

    @Test
    void exceptionMessageMentionsInput() {
        assertThatThrownBy(() -> parser.parse("https://evil.com/x"))
                .isInstanceOf(InvalidUrlException.class)
                .hasMessageContaining("https://evil.com/x");
    }
}
