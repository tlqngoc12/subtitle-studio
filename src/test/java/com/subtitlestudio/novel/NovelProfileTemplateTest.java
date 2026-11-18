package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class NovelProfileTemplateTest {

    @Test
    void everyTemplateHasTheCheckSectionBeforeTheSummary() {
        for (String lang : List.of("th", "en", "es")) {
            String text = NovelProfileTemplate.render(lang, "T", "A", List.of(), "d");
            assertThat(text).contains("## Kiểm tra" + (char) 10 + "- (Thêm dòng dạng \"cụm sai\" → \"gợi ý\" | \"gợi ý khác\" (lý do).");
            assertThat(text.indexOf("## Kiểm tra")).isLessThan(text.indexOf("## Tóm tắt nội dung chính"));
        }
    }

    @Test
    void originalTemplate() {
        String text = NovelProfileTemplate.render("vi", "Truyện Của Tôi", "EmiBonnie", List.of("GL", "romance"),
                "Một câu chuyện ngắn.");
        assertThat(text).contains("# Hồ sơ truyện: Truyện Của Tôi", "## Thông tin", "EmiBonnie", "GL, romance",
                "## Bối cảnh", "## Nhân vật", "## Xưng hô", "## Tên riêng và thuật ngữ", "## Văn phong",
                "## Không được làm", "## Kiểm tra", "## Tóm tắt nội dung chính", "Một câu chuyện ngắn.")
                .doesNotContain("## Ngôn ngữ gốc").doesNotContain("{{").doesNotContain("không dịch từng chữ");
        assertThat(text.indexOf("## Kiểm tra")).isLessThan(text.indexOf("## Tóm tắt nội dung chính"));
        assertThat(text).contains("## Kiểm tra" + (char) 10
                + "- (Thêm dòng dạng \"cụm sai\" → \"gợi ý\" | \"gợi ý khác\" (lý do).");
    }

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
    void aSpanishNovelGetsTheSpanishTemplateAndOthersKeepTheirs() {
        String es = NovelProfileTemplate.render("es", "T", "A", List.of(), "d");
        assertThat(es).contains("tiếng Tây Ban Nha").doesNotContain("tiếng Anh").doesNotContain("{{");
        assertThat(NovelProfileTemplate.render("en", "T", "A", List.of(), "d")).contains("tiếng Anh")
                .doesNotContain("Tây Ban Nha");
        assertThat(NovelProfileTemplate.render("fr", "T", "A", List.of(), "d")).contains("tiếng Anh");
        assertThat(NovelProfileTemplate.render("th", "T", "A", List.of(), "d")).doesNotContain("Tây Ban Nha");
    }

    @Test
    void carriesNothingFromAnotherStory() {
        for (String lang : List.of("th", "en", "es")) {
            assertThat(NovelProfileTemplate.render(lang, "T", "A", List.of(), "d"))
                    .doesNotContain("Perth", "Pipim", "Sugar");
        }
    }

    @Test
    void bothTemplatesCarryTheBonnieAndEmiPronounRuleBeforeTheSpecificPairs() {
        for (String lang : List.of("en", "th", "es")) {
            String text = NovelProfileTemplate.render(lang, "T", "A", List.of(), "d");
            int section = text.indexOf("## Xưng hô");
            int bonnie = text.indexOf("- Bonnie: ");
            int emi = text.indexOf("- Emi: ");
            int pairs = text.indexOf("- Cặp xưng hô cụ thể");
            assertThat(section).as(lang).isGreaterThanOrEqualTo(0);
            assertThat(bonnie).as(lang).isGreaterThan(section);
            assertThat(emi).as(lang).isGreaterThan(bonnie);
            assertThat(pairs).as(lang).isGreaterThan(emi);
            assertThat(text.substring(bonnie, emi)).as(lang).contains("→ \"em\"");
            assertThat(text.substring(emi, pairs)).as(lang).contains("→ \"cô\"");
            assertThat(text.substring(section, pairs)).as(lang).contains("Đại từ ngôi thứ ba mặc định cho Bonnie và Emi");
        }
    }
}
