package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class TextChapterPromptTest {

    private static TextChapterPrompt prompt(String language) {
        return new TextChapterPrompt("Warm", 3, null, "p", null, language, null, null, "text");
    }

    @Test
    void namesTheSourceLanguageInVietnamese() {
        assertThat(prompt("th").languageName()).isEqualTo("tiếng Thái");
        assertThat(prompt("en").languageName()).isEqualTo("tiếng Anh");
        assertThat(prompt("es").languageName()).isEqualTo("tiếng Tây Ban Nha");
    }

    @Test
    void anUnknownLanguageThrowsInsteadOfFallingBackToThai() {
        assertThatThrownBy(() -> prompt("fr").languageName()).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> prompt(null).languageName()).isInstanceOf(IllegalStateException.class);
    }
}
