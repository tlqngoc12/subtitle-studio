package com.subtitlestudio.novel.wattpad;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class WattpadTextTest {

    @Test
    void paragraphsAreSeparatedByOneBlankLine() {
        assertThat(WattpadText.toPlain("<p data-p-id=\"a\">One.</p><p>Two.</p>")).isEqualTo("One.\n\nTwo.");
    }

    @Test
    void brBecomesANewlineInsideTheParagraph() {
        assertThat(WattpadText.toPlain("<p>Line one<br>Line two<br/>Line three</p>"))
                .isEqualTo("Line one\nLine two\nLine three");
    }

    @Test
    void entitiesAreDecoded() {
        assertThat(WattpadText.toPlain("<p>Tom &amp; Jerry &ldquo;hi&rdquo; &#8212; ok&nbsp;now</p>"))
                .isEqualTo("Tom & Jerry “hi” — ok now");
    }

    @Test
    void anImageOnlyParagraphIsDropped() {
        assertThat(WattpadText.toPlain("<p>Before</p><p><img src=\"x.jpg\"></p><p>After</p>"))
                .isEqualTo("Before\n\nAfter");
    }

    @Test
    void otherTagsKeepTheirText() {
        assertThat(WattpadText.toPlain("<p>A <b>bold</b> and <i>soft</i> <a href=\"u\">word</a></p>"))
                .isEqualTo("A bold and soft word");
    }

    @Test
    void sceneBreaksStayAsTheirOwnParagraph() {
        assertThat(WattpadText.toPlain("<p>Before</p><p>* * *</p><p>After</p>")).isEqualTo("Before\n\n* * *\n\nAfter");
        assertThat(WattpadText.toPlain("<p>Before<br>***<br>After</p>")).isEqualTo("Before\n\n***\n\nAfter");
    }

    @Test
    void emptyParagraphsAndExtraBlankLinesCollapse() {
        assertThat(WattpadText.toPlain("<p>A</p><p></p><p>&nbsp;</p><p>B<br><br><br>C</p>")).isEqualTo("A\n\nB\nC");
    }

    @Test
    void emptyOrBlankInputGivesAnEmptyString() {
        assertThat(WattpadText.toPlain(null)).isEmpty();
        assertThat(WattpadText.toPlain("")).isEmpty();
        assertThat(WattpadText.toPlain("  \n ")).isEmpty();
        assertThat(WattpadText.toPlain("<p><img src=\"x\"></p>")).isEmpty();
    }

    @Test
    void textWithoutParagraphTagsStillWorks() {
        assertThat(WattpadText.toPlain("Just text<br>second line")).isEqualTo("Just text\nsecond line");
    }

    @Test
    void thaiTextSurvives() {
        assertThat(WattpadText.toPlain("<p>สวัสดี</p>"))
                .isEqualTo("สวัสดี");
    }

    @Test
    void theSampleFixtureConverts() throws Exception {
        String html = Files.readString(Path.of("src/test/resources/wattpad/part-text-sample.html"),
                StandardCharsets.UTF_8);

        assertThat(WattpadText.toPlain(html)).isEqualTo("Dim light & warm coffee.\n\n"
                + "“Hello,” she said.\nHe did not answer.\n\n* * *\n\nMorning came. Slowly.");
    }

    @Test
    void parseKeepsAPlaceholderForEveryImageOfAnImageOnlyPart() throws Exception {
        String html = Files.readString(Path.of("src/test/resources/wattpad/part-1631821143.html"),
                StandardCharsets.UTF_8);

        WattpadText.Parsed parsed = WattpadText.parse(html);

        assertThat(parsed.text()).isEqualTo(
                "[[image-url:0]]\n\n[[image-url:1]]\n\n[[image-url:2]]\n\n[[image-url:3]]");
        assertThat(parsed.imageUrls()).containsExactly("https://img.wattpad.com/075aa9e7/cover.jpg",
                "https://img.wattpad.com/592a9753/card1.png", "https://img.wattpad.com/3629c571/card2.png",
                "https://img.wattpad.com/f5751ba0/card3.png");
        assertThat(WattpadText.toPlain(html)).isEmpty();
    }

    @Test
    void parseKeepsImagesBetweenTheParagraphsTheyStandAmong() throws Exception {
        String html = Files.readString(Path.of("src/test/resources/wattpad/part-text-and-images.html"),
                StandardCharsets.UTF_8);

        WattpadText.Parsed parsed = WattpadText.parse(html);

        assertThat(parsed.text()).isEqualTo("Before the picture.\n\n[[image-url:0]]\n\nBetween pictures.\n\n"
                + "[[image-url:1]]\n\nAfter the second picture.");
        assertThat(parsed.imageUrls()).containsExactly("https://img.wattpad.com/aa/one.jpg",
                "https://img.wattpad.com/aa/two.jpg");
        assertThat(WattpadText.toPlain(html))
                .isEqualTo("Before the picture.\n\nBetween pictures.\nAfter the second picture.");
    }

    @Test
    void parseOfTextWithoutImagesEqualsToPlain() {
        String html = "<p>One.</p><p>* * *</p><p>Two<br>lines</p>";

        assertThat(WattpadText.parse(html).text()).isEqualTo(WattpadText.toPlain(html));
        assertThat(WattpadText.parse(html).imageUrls()).isEmpty();
    }

    @Test
    void placeholderIndexReadsOnlyAWholeParagraph() {
        assertThat(WattpadText.placeholderIndex(" [[image-url:12]] ")).isEqualTo(12);
        assertThat(WattpadText.placeholderIndex("a [[image-url:1]]")).isEqualTo(-1);
        assertThat(WattpadText.placeholderIndex(null)).isEqualTo(-1);
    }

    @Test
    void sceneBreakDetection() {
        assertThat(SceneBreak.isBreak("***")).isTrue();
        assertThat(SceneBreak.isBreak(" * * * ")).isTrue();
        assertThat(SceneBreak.isBreak("---")).isTrue();
        assertThat(SceneBreak.isBreak("~~~~")).isTrue();
        assertThat(SceneBreak.isBreak("• • •")).isTrue();
        assertThat(SceneBreak.isBreak("**")).isFalse();
        assertThat(SceneBreak.isBreak("**bold**")).isFalse();
        assertThat(SceneBreak.isBreak("Hello")).isFalse();
        assertThat(SceneBreak.isBreak("...")).isFalse();
    }
}
