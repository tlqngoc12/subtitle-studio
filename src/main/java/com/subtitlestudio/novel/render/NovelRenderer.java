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
import java.util.ArrayList;
import java.util.List;

/**
 * Draws a chapter's Vietnamese text as page images for the public site (spec section 7): reading font, title on the
 * first page, lines broken with {@link LineBreakMeasurer} (a word longer than the line is broken inside), a faint
 * diagonal watermark. Pages carry no footer and only a slim margin top and bottom (pages 2+), so consecutive images
 * read as one continuous strip. Same input, same pixels.
 */
public class NovelRenderer {

    /** Bump when the drawing changes so cached images are redrawn. */
    static final int VERSION = 5;
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

    private final int fontSize;
    private final Font body;
    private final Font title;
    private final Font small;

    public NovelRenderer(int fontSize) {
        this.fontSize = fontSize;
        Font base = load();
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

        List<List<Line>> pages = new ArrayList<>();
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
            if (paragraph.isEmpty()) {
                // A blank line typed by the translator: one empty line of space (nothing at the top of a page).
                if (y > pageTop) {
                    y += lineHeight;
                }
                continue;
            }
            for (TextLayout layout : layouts(paragraph, body, frc, wrap)) {
                if (y + lineHeight > bottom && !page.isEmpty()) {
                    pages.add(page);
                    page = new ArrayList<>();
                    y = TOP;
                    pageTop = TOP;
                }
                page.add(new Line(layout, y + layout.getAscent()));
                y += lineHeight;
            }
            y += lineHeight * 0.35f;
        }
        pages.add(page);

        List<BufferedImage> images = new ArrayList<>();
        for (int k = 0; k < pages.size(); k++) {
            images.add(draw(pages.get(k), input, format));
        }
        return images;
    }

    private record Line(TextLayout layout, float baseline) {}

    private BufferedImage draw(List<Line> lines, RenderInput input, PageFormat format) {
        // Transparent paper: the reader colours it with CSS.
        BufferedImage img = new BufferedImage(format.width(), format.height(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        watermark(g, nfc(input.watermark()) + " · " + nfc(input.novelTitle()), format);

        g.setColor(Color.BLACK);
        for (Line line : lines) {
            line.layout().draw(g, format.margin(), line.baseline());
        }

        g.dispose();
        return img;
    }

    private void watermark(Graphics2D g, String text, PageFormat format) {
        Graphics2D w = (Graphics2D) g.create();
        w.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, WATERMARK_ALPHA));
        w.setColor(Color.BLACK);
        w.setFont(small);
        w.rotate(Math.toRadians(-30), format.width() / 2.0, format.height() / 2.0);
        float advance = new TextLayout(text, small, w.getFontRenderContext()).getAdvance() + 120;
        int step = fontSize * 5;
        int reach = Math.max(format.width(), format.height()) * 2;
        int row = 0;
        for (int y = -reach / 2; y < reach; y += step, row++) {
            float offset = (row % 2) * advance / 2;
            for (float x = -reach / 2f - offset; x < reach; x += advance) {
                w.drawString(text, x, y);
            }
        }
        w.dispose();
    }

    private static List<TextLayout> layouts(String text, Font font, FontRenderContext frc, float wrap) {
        List<TextLayout> out = new ArrayList<>();
        if (text.isEmpty()) {
            return out;
        }
        AttributedString styled = new AttributedString(text);
        styled.addAttribute(TextAttribute.FONT, font);
        LineBreakMeasurer measurer = new LineBreakMeasurer(styled.getIterator(), frc);
        while (measurer.getPosition() < text.length()) {
            out.add(measurer.nextLayout(wrap));
        }
        return out;
    }

    static String heading(RenderInput input) {
        String t = input.chapterTitle() == null || input.chapterTitle().isBlank() ? "" : ": " + input.chapterTitle();
        return nfc((input.hasLabel() ? input.chapterLabel().strip() : "Chương " + input.chapterNo()) + t);
    }

    /** Lines of the text, each non-empty one a paragraph and each empty one a blank line; leading/trailing blanks dropped. */
    private static List<String> paragraphs(String text) {
        if (text == null) {
            return List.of();
        }
        List<String> lines = new ArrayList<>(nfc(text).lines().map(String::strip).toList());
        while (!lines.isEmpty() && lines.getFirst().isEmpty()) {
            lines.removeFirst();
        }
        while (!lines.isEmpty() && lines.getLast().isEmpty()) {
            lines.removeLast();
        }
        return lines;
    }

    private static String nfc(String s) {
        return s == null ? "" : Normalizer.normalize(s, Normalizer.Form.NFC);
    }

    private static Font load() {
        try (InputStream in = NovelRenderer.class.getResourceAsStream("/fonts/Literata.ttf")) {
            if (in == null) {
                throw new IllegalStateException("fonts/Literata.ttf is missing from the classpath");
            }
            return Font.createFont(Font.TRUETYPE_FONT, in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (FontFormatException e) {
            throw new IllegalStateException(e);
        }
    }
}
