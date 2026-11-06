package com.subtitlestudio.novel.render;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.awt.image.BufferedImage;
import java.text.Normalizer;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class NovelRendererTest {

    private static final SubtitleStudioProperties.Novel.Render SIZE = SubtitleStudioProperties.Novel.Render.defaults();
    private static final String PARAGRAPH = "Mai đứng lặng bên cửa sổ, nhìn mưa rơi trên con đường quen thuộc. "
            + "Cô nhớ lại những ngày hè năm ấy, khi Nam còn ở đây, khi mọi thứ còn đơn giản và dịu dàng.";

    private final NovelRenderer renderer = new NovelRenderer(SIZE);
    private final ImageEncoder png = ImageEncoder.png();

    private static RenderInput input(String text) {
        return new RenderInput("Tình Yêu Mùa Hạ", 3, null, "Mưa", text, "subtitle-studio-vn.pages.dev");
    }

    private static String text(int paragraphs) {
        return String.join("\n\n", java.util.Collections.nCopies(paragraphs, PARAGRAPH));
    }

    @Test
    void headingAndFooterUseTheLabelWhenThereIsOne() {
        RenderInput plain = new RenderInput("T", 3, null, "Mưa", "x", "w");
        RenderInput special = new RenderInput("T", 31, "Ngoại truyện 1", "Mưa", "x", "w");

        assertThat(NovelRenderer.heading(plain)).isEqualTo("Chương 3: Mưa");
        assertThat(NovelRenderer.heading(special)).isEqualTo("Ngoại truyện 1: Mưa");
        assertThat(NovelRenderer.footer(plain, 2, 5)).isEqualTo("Ch. 3 · 2/5");
        assertThat(NovelRenderer.footer(special, 2, 5)).isEqualTo("Ngoại truyện 1 · 2/5");
    }

    @Test
    void imagesHaveConfiguredSize() {
        List<BufferedImage> pages = renderer.render(input(text(3)));

        assertThat(pages).isNotEmpty().allSatisfy(img -> {
            assertThat(img.getWidth()).isEqualTo(1080);
            assertThat(img.getHeight()).isEqualTo(1600);
        });
    }

    @Test
    void sameInputSameBytes() {
        byte[] a = png.encode(renderer.render(input(text(5))).getFirst());
        byte[] b = png.encode(renderer.render(input(text(5))).getFirst());

        assertThat(a).isEqualTo(b);
    }

    @Test
    void longTextMakesMorePages() {
        int short3 = renderer.render(input(text(10))).size();
        int long30 = renderer.render(input(text(30))).size();

        assertThat(long30).isGreaterThan(short3);
        assertThat(short3).isGreaterThanOrEqualTo(2);
    }

    @Test
    void vietnameseGlyphsExist() {
        assertThat(renderer.font().canDisplayUpTo("Nguyễn Thị Ánh Tuyết – ỷ ỹ Đ ơ ư “” …")).isEqualTo(-1);
    }

    @Test
    void decomposedInputRendersLikeComposed() {
        String nfc = Normalizer.normalize(PARAGRAPH, Normalizer.Form.NFC);
        String nfd = Normalizer.normalize(PARAGRAPH, Normalizer.Form.NFD);
        assertThat(nfd).isNotEqualTo(nfc);

        assertThat(png.encode(renderer.render(input(nfd)).getFirst()))
                .isEqualTo(png.encode(renderer.render(input(nfc)).getFirst()));
    }

    @Test
    void veryLongWordIsBrokenInsideTheLine() {
        String word = "a".repeat(500);

        List<BufferedImage> pages = assertTimeoutPreemptively(Duration.ofSeconds(5),
                () -> renderer.render(input(word)));

        BufferedImage first = pages.getFirst();
        // The text column ends 64 px before the right edge; the watermark is too faint to count as ink.
        for (int x = first.getWidth() - 60; x < first.getWidth(); x++) {
            for (int y = 300; y < first.getHeight() - 150; y++) {
                assertThat(isInk(first.getRGB(x, y))).as("ink at %d,%d", x, y).isFalse();
            }
        }
    }

    @Test
    void emptyParagraphsDoNotCreateBlankPages() {
        int plain = renderer.render(input(PARAGRAPH)).size();
        int spaced = renderer.render(input(PARAGRAPH + "\n\n\n\n\n\n\n\n" + "\n\n".repeat(200))).size();

        assertThat(spaced).isEqualTo(plain).isEqualTo(1);
    }

    @Test
    void emptyTextStillMakesTitlePage() {
        assertThat(renderer.render(input(""))).hasSize(1);
    }

    private static boolean isInk(int rgb) {
        int r = (rgb >> 16) & 0xff;
        int g = (rgb >> 8) & 0xff;
        int b = rgb & 0xff;
        return (r + g + b) / 3 < 150;
    }
}
