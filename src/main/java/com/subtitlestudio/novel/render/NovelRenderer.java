package com.subtitlestudio.novel.render;

import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontFormatException;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.font.FontRenderContext;
import java.awt.font.LineBreakMeasurer;
import java.awt.font.TextAttribute;
import java.awt.font.TextLayout;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.text.AttributedString;
import java.text.Normalizer;
import com.subtitlestudio.novel.ImageMarkers;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Draws a chapter's Vietnamese text as page images for the public site (spec section 7): reading font, title on the
 * first page, lines broken with {@link LineBreakMeasurer} (a word longer than the line is broken inside), a faint
 * diagonal watermark. Pages carry no footer and only a slim margin top and bottom (pages 2+), so consecutive images
 * read as one continuous strip. Same input, same pixels.
 *
 * <p>A {@code [[image:N]]} paragraph of the text is a picture of the chapter: the text before it ends its page, the
 * picture gets a page of its own (scaled to the page width, watermarked like the text pages), and the text goes on
 * on a new page. A text without markers is drawn exactly as before.
 */
public class NovelRenderer {

    /** Bump when the drawing changes so cached images are redrawn. */
    static final int VERSION = 7;
    /**
     * Top of the first line box on pages 2+; the first page keeps {@link #FIRST_TOP} for the heading. A line box
     * has about 18 px of built-in leading above the glyphs, so a slightly negative value leaves ~12 px of paper.
     */
    static final int TOP = -6;
    static final int FIRST_TOP = 110;
    /** Bottom margin of every page (the line box has its own leading below the glyphs); a line that does not fit moves to the next page whole. */
    static final int BOTTOM = 0;
    static final double LINE_SPACING = 1.7;
    static final float WATERMARK_ALPHA = 0.06f;
    /** Noto Emoji sits a little small next to Literata, so it is drawn slightly larger. */
    static final float EMOJI_SCALE = 1.1f;
    /** A picture page never gets taller than this (WebP allows 16,383 px); a taller picture is scaled down to fit. */
    static final int MAX_IMAGE_PAGE_HEIGHT = 16_000;

    private static final Logger log = LoggerFactory.getLogger(NovelRenderer.class);

    private final int fontSize;
    private final Font body;
    private final Font title;
    private final Font small;
    /** Monochrome fallback for code points the reading font has no glyph for (emoji). */
    private final Font emoji;

    public NovelRenderer(int fontSize) {
        this.fontSize = fontSize;
        Font base = load("/fonts/Literata.ttf");
        this.emoji = load("/fonts/NotoEmoji.ttf");
        this.body = base.deriveFont((float) fontSize);
        this.title = base.deriveFont(Font.BOLD, fontSize * 1.3f);
        this.small = base.deriveFont(fontSize * 0.55f);
    }

    Font font() {
        return body;
    }

    public int fontSize() {
        return fontSize;
    }

    /** One image per page in the given format; at least one (the title page). */
    public List<BufferedImage> render(RenderInput input, PageFormat format) {
        FontRenderContext frc = new FontRenderContext(new AffineTransform(), true, true);
        float wrap = format.width() - 2f * format.margin();
        float bottom = format.height() - BOTTOM;
        float lineHeight = (float) (fontSize * LINE_SPACING);

        List<Page> pages = new ArrayList<>();
        List<Line> page = new ArrayList<>();
        float y = FIRST_TOP;
        float pageTop = FIRST_TOP;
        for (TextLayout layout : layouts(heading(input), title, frc, wrap)) {
            y += layout.getAscent();
            page.add(new Line(layout, y));
            y += layout.getDescent() + layout.getLeading() + fontSize * 0.3f;
        }
        y += lineHeight * 0.6f;

        for (String paragraph : paragraphs(input.text())) {
            OptionalLong imageId = ImageMarkers.mediaId(paragraph);
            if (imageId.isPresent()) {
                BufferedImage picture = input.images().apply(imageId.getAsLong());
                if (picture == null) {
                    log.warn("Chapter {}: image {} is missing, left out of the pages", input.chapterNo(),
                            imageId.getAsLong());
                    continue;
                }
                if (!page.isEmpty()) {
                    pages.add(new Page(page, null, true)); // ends right below its last line: a picture follows
                    page = new ArrayList<>();
                }
                pages.add(new Page(List.of(), picture, false));
                y = TOP;
                pageTop = TOP;
                continue;
            }
            if (paragraph.isEmpty()) {
                // A blank line typed by the translator: one empty line of space (nothing at the top of a page).
                if (y > pageTop) {
                    y += lineHeight;
                }
                continue;
            }
            for (TextLayout layout : layouts(paragraph, body, frc, wrap)) {
                if (y + lineHeight > bottom && !page.isEmpty()) {
                    pages.add(new Page(page, null, false));
                    page = new ArrayList<>();
                    y = TOP;
                    pageTop = TOP;
                }
                page.add(new Line(layout, y + layout.getAscent()));
                y += lineHeight;
            }
            y += lineHeight * 0.35f;
        }
        if (!page.isEmpty() || pages.isEmpty()) {
            pages.add(new Page(page, null, true)); // the last page ends below its last line
        }

        List<BufferedImage> images = new ArrayList<>();
        for (Page p : pages) {
            if (p.picture() != null) {
                images.add(drawPicture(p.picture(), input, format));
                continue;
            }
            int height = format.height();
            if (p.trimmed()) {
                // A page that nothing more of the text follows (the last one, or one a picture follows) ends just below
                // its last line (plus the side margin), not at the full format height.
                double lastBottom = 0;
                for (Line line : p.lines()) {
                    lastBottom = Math.max(lastBottom, line.baseline() + line.layout().getDescent());
                }
                height = (int) Math.max(1, Math.min(height, Math.ceil(lastBottom + format.margin())));
            }
            images.add(draw(p.lines(), input, format, height));
        }
        return images;
    }

    private record Line(TextLayout layout, float baseline) {}

    /** One page: text lines, or one picture. {@code trimmed}: the page ends below its last line. */
    private record Page(List<Line> lines, BufferedImage picture, boolean trimmed) {}

    /** The picture as wide as the page (taller than the format when it is tall), with the watermark over it. */
    private BufferedImage drawPicture(BufferedImage picture, RenderInput input, PageFormat format) {
        double scale = Math.min((double) format.width() / picture.getWidth(),
                (double) MAX_IMAGE_PAGE_HEIGHT / picture.getHeight());
        int w = Math.max(1, (int) Math.round(picture.getWidth() * scale));
        int h = Math.max(1, (int) Math.round(picture.getHeight() * scale));
        BufferedImage img = new BufferedImage(format.width(), h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.drawImage(picture, (format.width() - w) / 2, 0, w, h, null);
        watermark(g, clean(input.watermark()) + " · " + clean(input.novelTitle()), format, h);
        g.dispose();
        return img;
    }

    private BufferedImage draw(List<Line> lines, RenderInput input, PageFormat format, int height) {
        // Transparent paper: the reader colours it with CSS.
        BufferedImage img = new BufferedImage(format.width(), height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        watermark(g, clean(input.watermark()) + " · " + clean(input.novelTitle()), format, height);

        g.setColor(Color.BLACK);
        for (Line line : lines) {
            line.layout().draw(g, format.margin(), line.baseline());
        }

        g.dispose();
        return img;
    }

    private void watermark(Graphics2D g, String text, PageFormat format, int height) {
        Graphics2D w = (Graphics2D) g.create();
        w.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, WATERMARK_ALPHA));
        w.setColor(Color.BLACK);
        w.setFont(small);
        w.rotate(Math.toRadians(-30), format.width() / 2.0, height / 2.0);
        AttributedString styled = styled(text, small);
        float advance = new TextLayout(styled.getIterator(), w.getFontRenderContext()).getAdvance() + 120;
        int step = fontSize * 5;
        int reach = Math.max(format.width(), height) * 2;
        int row = 0;
        for (int y = -reach / 2; y < reach; y += step, row++) {
            float offset = (row % 2) * advance / 2;
            for (float x = -reach / 2f - offset; x < reach; x += advance) {
                w.drawString(styled.getIterator(), x, y);
            }
        }
        w.dispose();
    }

    private List<TextLayout> layouts(String text, Font font, FontRenderContext frc, float wrap) {
        List<TextLayout> out = new ArrayList<>();
        if (text.isEmpty()) {
            return out;
        }
        AttributedString styled = styled(text, font);
        LineBreakMeasurer measurer = new LineBreakMeasurer(styled.getIterator(), frc);
        while (measurer.getPosition() < text.length()) {
            out.add(measurer.nextLayout(wrap));
        }
        return out;
    }

    /**
     * The text in {@code base}, except each code point the base font cannot draw but the emoji font can, which gets the
     * emoji font (same style, {@link #EMOJI_SCALE} larger). A code point neither font has stays in {@code base}.
     */
    AttributedString styled(String text, Font base) {
        AttributedString styled = new AttributedString(text);
        if (text.isEmpty()) {
            return styled;
        }
        styled.addAttribute(TextAttribute.FONT, base);
        Font fallback = null;
        int i = 0;
        while (i < text.length()) {
            int cp = text.codePointAt(i);
            int n = Character.charCount(cp);
            if (!base.canDisplay(cp) && emoji.canDisplay(cp)) {
                if (fallback == null) {
                    fallback = emoji.deriveFont(base.getStyle(), base.getSize2D() * EMOJI_SCALE);
                }
                styled.addAttribute(TextAttribute.FONT, fallback, i, i + n);
            }
            i += n;
        }
        return styled;
    }

    static String heading(RenderInput input) {
        String t = input.chapterTitle() == null || input.chapterTitle().isBlank()
                ? "Chương " + input.chapterNo() : input.chapterTitle().strip();
        return clean(t);
    }

    /** Lines of the text, each non-empty one a paragraph and each empty one a blank line; leading/trailing blanks dropped. */
    private static List<String> paragraphs(String text) {
        if (text == null) {
            return List.of();
        }
        List<String> lines = new ArrayList<>(clean(text).lines().map(String::strip).toList());
        while (!lines.isEmpty() && lines.getFirst().isEmpty()) {
            lines.removeFirst();
        }
        while (!lines.isEmpty() && lines.getLast().isEmpty()) {
            lines.removeLast();
        }
        return lines;
    }

    /**
     * NFC, without skin-tone modifiers (U+1F3FB-1F3FF), variation selectors (U+FE0E, U+FE0F) and zero-width joiners
     * (U+200D): the monochrome emoji font has no glyph for them, so a sequence shows as its separate base glyphs.
     */
    static String clean(String s) {
        if (s == null) {
            return "";
        }
        String nfc = Normalizer.normalize(s, Normalizer.Form.NFC);
        StringBuilder out = new StringBuilder(nfc.length());
        nfc.codePoints()
                .filter(cp -> !(cp >= 0x1F3FB && cp <= 0x1F3FF) && cp != 0xFE0E && cp != 0xFE0F && cp != 0x200D)
                .forEach(out::appendCodePoint);
        return out.toString();
    }

    private static Font load(String resource) {
        try (InputStream in = NovelRenderer.class.getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException(resource + " is missing from the classpath");
            }
            return Font.createFont(Font.TRUETYPE_FONT, in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (FontFormatException e) {
            throw new IllegalStateException(e);
        }
    }
}
