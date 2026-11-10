package com.subtitlestudio.novel.render;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.awt.image.BufferedImage;
import java.text.Normalizer;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class NovelRendererTest {

    private static final String PARAGRAPH = "Mai đứng lặng bên cửa sổ, nhìn mưa rơi trên con đường quen thuộc. "
            + "Cô nhớ lại những ngày hè năm ấy, khi Nam còn ở đây, khi mọi thứ còn đơn giản và dịu dàng.";

    private static final int OLD_PAGE_COUNT = 9;

    private final NovelRenderer renderer = new NovelRenderer(44);
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
    void drawsEachFormatAtItsSize() {
        for (PageFormat format : PageFormat.ALL) {
            List<BufferedImage> pages = renderer.render(input(text(60)), format);
            assertThat(pages.size()).isGreaterThan(1);
            assertThat(pages).allSatisfy(img -> {
                assertThat(img.getWidth()).isEqualTo(format.width());
                assertThat(img.getColorModel().hasAlpha()).isTrue();
            });
            // Only the last page is cropped to its text.
            assertThat(pages.subList(0, pages.size() - 1)).allSatisfy(img -> assertThat(img.getHeight()).isEqualTo(format.height()));
            assertThat(pages.getLast().getHeight()).isBetween(1, format.height());
        }
    }

    @Test
    void lastPageIsCroppedToItsText() {
        for (PageFormat format : PageFormat.ALL) {
            List<BufferedImage> pages = renderer.render(input("Một dòng ngắn."), format);
            assertThat(pages).hasSize(1);
            BufferedImage img = pages.getFirst();
            assertThat(img.getHeight()).isPositive().isLessThan(format.height());
            int lowestInk = -1;
            for (int y = img.getHeight() - 1; y >= 0 && lowestInk < 0; y--) {
                for (int x = 0; x < img.getWidth(); x++) {
                    int argb = img.getRGB(x, y);
                    if ((argb >>> 24) > 200 && (argb & 0xffffff) == 0) {
                        lowestInk = y;
                        break;
                    }
                }
            }
            assertThat(lowestInk).isGreaterThan(0);
            // Ink ends within a margin (plus descender rounding) of the bottom edge: one line of space, no more.
            assertThat(img.getHeight() - lowestInk).isLessThanOrEqualTo(format.margin() + 60);
        }
    }

    @Test
    void paperIsTransparentAndInkIsBlack() {
        BufferedImage img = renderer.render(input(text(3)), PageFormat.M).getFirst();

        assertThat(img.getRGB(0, 0) >>> 24).isZero();
        boolean blackInk = false;
        for (int y = 0; y < img.getHeight() && !blackInk; y++) {
            for (int x = 0; x < img.getWidth(); x++) {
                int argb = img.getRGB(x, y);
                if ((argb >>> 24) > 200 && (argb & 0xffffff) == 0) {
                    blackInk = true;
                    break;
                }
            }
        }
        assertThat(blackInk).isTrue();
    }

    @Test
    void inkStaysInsideMargin() {
        PageFormat m = PageFormat.M;
        for (BufferedImage img : renderer.render(input(text(30)), m)) {
            for (int y = 0; y < img.getHeight(); y++) {
                for (int x = 0; x < img.getWidth(); x++) {
                    if ((img.getRGB(x, y) >>> 24) > 128) {
                        assertThat(x).as("ink at %d,%d", x, y).isBetween(m.margin() - 2, m.width() - m.margin() + 1);
                    }
                }
            }
        }
    }

    @Test
    void narrowerFormatNeedsMorePages() {
        RenderInput in = input(longText(20_000));

        assertThat(renderer.render(in, PageFormat.L).size()).isGreaterThan(renderer.render(in, PageFormat.S).size());
    }

    @Test
    void averageChapterStaysUnderFileBudget() {
        RenderInput in = input(longText(30_000));
        int total = PageFormat.ALL.stream().mapToInt(f -> renderer.render(in, f).size()).sum();

        assertThat(total).isLessThanOrEqualTo(65); // measured 62 for this text; the plan estimated about 57
    }

    private static String longText(int chars) {
        String paragraph = PARAGRAPH + " " + PARAGRAPH + " " + PARAGRAPH.substring(0, 60);
        return String.join("\n", java.util.Collections.nCopies(chars / paragraph.length() + 1, paragraph));
    }

    @Test
    void sameInputSameBytes() {
        byte[] a = png.encode(renderer.render(input(text(5)), PageFormat.S).getFirst());
        byte[] b = png.encode(renderer.render(input(text(5)), PageFormat.S).getFirst());

        assertThat(a).isEqualTo(b);
    }

    @Test
    void longTextMakesMorePages() {
        int short3 = renderer.render(input(text(30)), PageFormat.S).size();
        int long30 = renderer.render(input(text(90)), PageFormat.S).size();

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

        assertThat(png.encode(renderer.render(input(nfd), PageFormat.S).getFirst()))
                .isEqualTo(png.encode(renderer.render(input(nfc), PageFormat.S).getFirst()));
    }

    @Test
    void veryLongWordIsBrokenInsideTheLine() {
        String word = "a".repeat(500);

        List<BufferedImage> pages = assertTimeoutPreemptively(Duration.ofSeconds(5),
                () -> renderer.render(input(word), PageFormat.S));

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
        int plain = renderer.render(input(PARAGRAPH), PageFormat.S).size();
        int spaced = renderer.render(input(PARAGRAPH + "\n\n\n\n\n\n\n\n" + "\n\n".repeat(200)), PageFormat.S).size();

        assertThat(spaced).isEqualTo(plain).isEqualTo(1);
    }

    @Test
    void emptyTextStillMakesTitlePage() {
        assertThat(renderer.render(input(""), PageFormat.S)).hasSize(1);
    }

    @Test
    void versionIsBumpedSoCachedImagesAreRedrawn() {
        assertThat(NovelRenderer.VERSION).isEqualTo(6);
    }

    @Test
    void eachBlankLineAddsSpace() {
        int one = lastInkRow(renderer.render(input("Mai đứng lặng.\nCô nhớ lại."), PageFormat.S).getFirst());
        int two = lastInkRow(renderer.render(input("Mai đứng lặng.\n\nCô nhớ lại."), PageFormat.S).getFirst());
        int three = lastInkRow(renderer.render(input("Mai đứng lặng.\n\n\nCô nhớ lại."), PageFormat.S).getFirst());

        assertThat(two).isGreaterThan(one);
        assertThat(three).isGreaterThan(two);
        assertThat(three - two).isCloseTo(two - one, org.assertj.core.data.Offset.offset(1));
    }

    @Test
    void leadingAndTrailingBlankLinesChangeNothing() {
        byte[] plain = png.encode(renderer.render(input("Mai đứng lặng.\n\nCô nhớ lại."), PageFormat.S).getFirst());
        byte[] padded = png.encode(renderer.render(input("\n\n\nMai đứng lặng.\n\nCô nhớ lại.\n\n\n"), PageFormat.S).getFirst());

        assertThat(padded).isEqualTo(plain);
    }

    @Test
    void laterPagesStartWithinASlimMarginOfTheTop() {
        List<BufferedImage> pages = renderer.render(input(text(30)), PageFormat.S);

        assertThat(pages.size()).isGreaterThanOrEqualTo(2);
        assertThat(firstInkRow(pages.get(0))).isGreaterThanOrEqualTo(100);
        for (int k = 1; k < pages.size(); k++) {
            assertThat(firstInkRow(pages.get(k))).as("page %d", k + 1).isBetween(0, 16);
        }
    }

    @Test
    void noFooterIsDrawnUnderAShortText() {
        BufferedImage img = renderer.render(input(PARAGRAPH), PageFormat.S).getFirst();

        // The old footer sat in the last 64 px; the cropped page ends one margin below its last line, nothing there.
        for (int y = img.getHeight() - 60; y < img.getHeight(); y++) {
            for (int x = 0; x < img.getWidth(); x++) {
                assertThat(isInk(img.getRGB(x, y))).as("ink at %d,%d", x, y).isFalse();
            }
        }
    }

    @Test
    void noLineIsCutAtTheEdgeOfAnImage() {
        List<BufferedImage> pages = renderer.render(input(text(30)), PageFormat.S);

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
        assertThat(renderer.render(input(text(30)), PageFormat.S).size()).isLessThanOrEqualTo(OLD_PAGE_COUNT);
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
        if ((rgb >>> 24) < 128) {
            return false; // transparent paper or the faint watermark
        }
        int r = (rgb >> 16) & 0xff;
        int g = (rgb >> 8) & 0xff;
        int b = rgb & 0xff;
        return (r + g + b) / 3 < 150;
    }
}
