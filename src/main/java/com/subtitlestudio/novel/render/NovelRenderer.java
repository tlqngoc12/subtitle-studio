package com.subtitlestudio.novel.render;

import com.subtitlestudio.config.SubtitleStudioProperties;
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
 * diagonal watermark and a footer {@code Ch. N · k/n}. Same input, same pixels.
 */
public class NovelRenderer {

    /** Bump when the drawing changes so cached images are redrawn. */
    static final int VERSION = 3;
    static final int MARGIN = 64;
    /** Top margin of pages 2+; the first page keeps {@link #FIRST_TOP} for the heading. */
    static final int TOP = 56;
    static final int FIRST_TOP = 110;
    static final int FOOTER = 64;
    static final double LINE_SPACING = 1.7;
    static final float WATERMARK_ALPHA = 0.06f;

    private static final Color PAPER = new Color(0xFB, 0xF8, 0xF1);
    private static final Color INK = new Color(0x22, 0x22, 0x22);
    private static final Color MUTED = new Color(0x8A, 0x84, 0x7A);

    private final SubtitleStudioProperties.Novel.Render size;
    private final Font body;
    private final Font title;
    private final Font small;

    public NovelRenderer(SubtitleStudioProperties.Novel.Render size) {
        this.size = size;
        Font base = load();
        this.body = base.deriveFont((float) size.fontSize());
        this.title = base.deriveFont(Font.BOLD, size.fontSize() * 1.3f);
        this.small = base.deriveFont(size.fontSize() * 0.55f);
    }

    Font font() {
        return body;
    }

    SubtitleStudioProperties.Novel.Render size() {
        return size;
    }

    /** One image per page; at least one (the title page). */
    public List<BufferedImage> render(RenderInput input) {
        FontRenderContext frc = new FontRenderContext(new AffineTransform(), true, true);
        float wrap = size.width() - 2f * MARGIN;
        float bottom = size.height() - FOOTER;
        float lineHeight = (float) (size.fontSize() * LINE_SPACING);

        List<List<Line>> pages = new ArrayList<>();
        List<Line> page = new ArrayList<>();
        float y = FIRST_TOP;
        float pageTop = FIRST_TOP;
        for (TextLayout layout : layouts(heading(input), title, frc, wrap)) {
            y += layout.getAscent();
            page.add(new Line(layout, y));
            y += layout.getDescent() + layout.getLeading() + size.fontSize() * 0.3f;
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
            images.add(draw(pages.get(k), input, k + 1, pages.size()));
        }
        return images;
    }

    private record Line(TextLayout layout, float baseline) {}

    private BufferedImage draw(List<Line> lines, RenderInput input, int k, int total) {
        BufferedImage img = new BufferedImage(size.width(), size.height(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setColor(PAPER);
        g.fillRect(0, 0, size.width(), size.height());
        watermark(g, nfc(input.watermark()) + " · " + nfc(input.novelTitle()));

        g.setColor(INK);
        for (Line line : lines) {
            line.layout().draw(g, MARGIN, line.baseline());
        }

        g.setColor(MUTED);
        g.setFont(small);
        String footer = footer(input, k, total);
        TextLayout layout = new TextLayout(footer, small, g.getFontRenderContext());
        // Centre the text's visible height (ascent to baseline) in the footer band.
        float baseline = size.height() - FOOTER / 2f + (layout.getAscent() - layout.getDescent()) / 2f;
        g.drawString(footer, (size.width() - layout.getAdvance()) / 2f, baseline);
        g.dispose();
        return img;
    }

    private void watermark(Graphics2D g, String text) {
        Graphics2D w = (Graphics2D) g.create();
        w.setComposite(AlphaComposite.getInstance(AlphaComposite.SRC_OVER, WATERMARK_ALPHA));
        w.setColor(Color.BLACK);
        w.setFont(small);
        w.rotate(Math.toRadians(-30), size.width() / 2.0, size.height() / 2.0);
        float advance = new TextLayout(text, small, w.getFontRenderContext()).getAdvance() + 120;
        int step = size.fontSize() * 5;
        int reach = Math.max(size.width(), size.height()) * 2;
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

    static String footer(RenderInput input, int k, int total) {
        String name = input.hasLabel() ? input.chapterLabel().strip() : "Ch. " + input.chapterNo();
        return nfc(name + " · " + k + "/" + total);
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
