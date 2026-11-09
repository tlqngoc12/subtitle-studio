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

    private static final int OLD_PAGE_COUNT = 9;

    private final NovelRenderer renderer = new NovelRenderer(SIZE);
    private final ImageEncoder png = ImageEncoder.png();

    private static RenderInput input(String text) {
        return new RenderInput("Tình Yêu Mùa Hạ", 3, null, "Mưa", text, "subtitle-studio-vn.pages.dev");
    }

    private static String text(int paragraphs) {
        return String.join("\n\n", java.util.Collections.nCopies(paragraphs, PARAGRAPH));
    }

    @Test
    void headingUsesTheLabelWhenThereIsOne() {
        RenderInput plain = new RenderInput("T", 3, null, "Mưa", "x", "w");
        RenderInput special = new RenderInput("T", 31, "Ngoại truyện 1", "Mưa", "x", "w");

        assertThat(NovelRenderer.heading(plain)).isEqualTo("Chương 3: Mưa");
        assertThat(NovelRenderer.heading(special)).isEqualTo("Ngoại truyện 1: Mưa");
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

    @Test
    void versionIsBumpedSoCachedImagesAreRedrawn() {
        assertThat(NovelRenderer.VERSION).isEqualTo(4);
    }

    @Test
    void eachBlankLineAddsSpace() {
        int one = lastInkRow(renderer.render(input("Mai đứng lặng.\nCô nhớ lại.")).getFirst());
        int two = lastInkRow(renderer.render(input("Mai đứng lặng.\n\nCô nhớ lại.")).getFirst());
        int three = lastInkRow(renderer.render(input("Mai đứng lặng.\n\n\nCô nhớ lại.")).getFirst());

        assertThat(two).isGreaterThan(one);
        assertThat(three).isGreaterThan(two);
        assertThat(three - two).isCloseTo(two - one, org.assertj.core.data.Offset.offset(1));
    }

    @Test
    void leadingAndTrailingBlankLinesChangeNothing() {
        byte[] plain = png.encode(renderer.render(input("Mai đứng lặng.\n\nCô nhớ lại.")).getFirst());
        byte[] padded = png.encode(renderer.render(input("\n\n\nMai đứng lặng.\n\nCô nhớ lại.\n\n\n")).getFirst());

        assertThat(padded).isEqualTo(plain);
    }

    @Test
    void laterPagesStartWithinASlimMarginOfTheTop() {
        List<BufferedImage> pages = renderer.render(input(text(30)));

        assertThat(pages.size()).isGreaterThanOrEqualTo(2);
        assertThat(firstInkRow(pages.get(0))).isGreaterThanOrEqualTo(100);
        for (int k = 1; k < pages.size(); k++) {
            assertThat(firstInkRow(pages.get(k))).as("page %d", k + 1).isBetween(0, 16);
        }
    }

    @Test
    void noFooterIsDrawnUnderAShortText() {
        BufferedImage img = renderer.render(input(PARAGRAPH)).getFirst();

        // The old footer sat in the last 64 px; a one-paragraph chapter has nothing there now.
        for (int y = img.getHeight() - 120; y < img.getHeight(); y++) {
            for (int x = 0; x < img.getWidth(); x++) {
                assertThat(isInk(img.getRGB(x, y))).as("ink at %d,%d", x, y).isFalse();
            }
        }
    }

    @Test
    void noLineIsCutAtTheEdgeOfAnImage() {
        List<BufferedImage> pages = renderer.render(input(text(30)));

        for (int k = 0; k < pages.size(); k++) {
            BufferedImage img = pages.get(k);
            for (int y : new int[] {0, 1, 2, 3, 4, 5, img.getHeight() - 6, img.getHeight() - 5, img.getHeight() - 4,
                    img.getHeight() - 3, img.getHeight() - 2, img.getHeight() - 1}) {
                for (int x = 0; x < img.getWidth(); x++) {
                    assertThat(isInk(img.getRGB(x, y))).as("page %d ink at %d,%d", k + 1, x, y).isFalse();
                }
            }
        }
        // Every page but the last is filled down to a slim bottom margin, so pages join into one strip.
        for (int k = 0; k < pages.size() - 1; k++) {
            assertThat(pages.get(k).getHeight() - lastInkRow(pages.get(k))).as("page %d", k + 1).isLessThanOrEqualTo(90);
        }
    }

    @Test
    void longTextDoesNotNeedMorePagesThanBefore() {
        // Version 3 (TOP 56, FOOTER 64, no change in line height) drew 30 paragraphs on OLD_PAGE_COUNT pages.
        assertThat(renderer.render(input(text(30))).size()).isLessThanOrEqualTo(OLD_PAGE_COUNT);
    }

    private static int firstInkRow(BufferedImage img) {
        for (int y = 0; y < img.getHeight() - 150; y++) {
            for (int x = 0; x < img.getWidth(); x++) {
                if (isInk(img.getRGB(x, y))) {
                    return y;
                }
            }
        }
        return -1;
    }

    /** Lowest row of dark text. */
    private static int lastInkRow(BufferedImage img) {
        for (int y = img.getHeight() - 1; y >= 0; y--) {
            for (int x = 0; x < img.getWidth(); x++) {
                if (isInk(img.getRGB(x, y))) {
                    return y;
                }
            }
        }
        return -1;
    }

    private static boolean isInk(int rgb) {
        int r = (rgb >> 16) & 0xff;
        int g = (rgb >> 8) & 0xff;
        int b = rgb & 0xff;
        return (r + g + b) / 3 < 150;
    }
}
