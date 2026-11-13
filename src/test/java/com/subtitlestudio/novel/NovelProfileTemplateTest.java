package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class NovelProfileTemplateTest {

    @Test
    void thaiTemplateFillsTheDetails() {
        String text = NovelProfileTemplate.render("th", "Moonshadow", "Khun A", List.of("GL", "romance"),
                "A short blurb about two people.");
        assertThat(text).contains("Moonshadow", "Khun A", "GL, romance", "tiếng Thái", "Kính ngữ",
                "A short blurb about two people.");
    }

    @Test
    void englishTemplateHasNoThaiSection() {
        String text = NovelProfileTemplate.render("en", "Moonshadow", "Khun A", List.of(), "Blurb");
        assertThat(text).contains("tiếng Anh").doesNotContain("Kính ngữ và từ đặc trưng tiếng Thái");
    }

    @Test
    void blankAuthorTagsAndDescriptionFallBack() {
        String text = NovelProfileTemplate.render("en", "T", " ", null, null);
        assertThat(text).contains("Tác giả: chưa rõ", "Thể loại: chưa rõ", "Chưa có tóm tắt.");
    }

    @Test
    void leavesNoPlaceholders() {
        assertThat(NovelProfileTemplate.render("th", "T", "A", List.of("x"), "d")).doesNotContain("{{");
        assertThat(NovelProfileTemplate.render("en", "T", "A", List.of("x"), "d")).doesNotContain("{{");
        assertThat(NovelProfileTemplate.render("en", "T", "A", List.of("x"), "has {{title}} inside"))
                .doesNotContain("{{summary}}");
    }

    @Test
    void trimsALongDescriptionToTwentyKilobytesAtASentence() {
        String description = ("Đây là một câu khá dài trong phần mô tả truyện. ".repeat(4) + "\n\n").repeat(150);
        assertThat(description.getBytes(StandardCharsets.UTF_8).length).isGreaterThan(30 * 1024);
        String text = NovelProfileTemplate.render("th", "T", "A", List.of(), description);
        assertThat(text.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(20 * 1024);
        assertThat(text.stripTrailing()).endsWithIgnoringCase(".");
    }

    @Test
    void carriesNothingFromAnotherStory() {
        for (String lang : List.of("th", "en")) {
            assertThat(NovelProfileTemplate.render(lang, "T", "A", List.of(), "d"))
                    .doesNotContain("Perth", "Pipim", "Sugar");
        }
    }
}
