package com.subtitlestudio.novel;

import static com.subtitlestudio.novel.ChapterExportFormat.fileBase;
import static com.subtitlestudio.novel.ChapterExportFormat.heading;
import static com.subtitlestudio.novel.ChapterExportFormat.html;
import static com.subtitlestudio.novel.ChapterExportFormat.markdown;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ChapterExportFormatTest {

    @Test
    void headingUsesLabelOrChapterNumberAndTitle() {
        assertEquals("Chapter 3", heading(3, null, null));
        assertEquals("Chapter 3 - Mưa", heading(3, " ", "Mưa"));
        assertEquals("Ngoại truyện 1 - Mưa", heading(3, "Ngoại truyện 1", "Mưa"));
    }

    @Test
    void fileBasePadsAndCleans() {
        assertEquals("007 - Chapter 7 - A_B_ C_", fileBase(7, 20, "Chapter 7 - A/B: C?"));
        assertEquals("0007 - Chapter 7", fileBase(7, 1200, "Chapter 7"));
        assertTrue(fileBase(1, 5, "x".repeat(300)).length() <= 120);
    }

    @Test
    void markdownKeepsTextAndNormalisesLineEnds() {
        assertEquals("# Chapter 1\n\nA\n\n[[image:2]]\n*B*", markdown("Chapter 1", "A\r\n\r\n[[image:2]]\r\n*B*"));
    }

    @Test
    void htmlMakesOneParagraphPerLine() {
        String h = html("Chapter 1", "Một.\nHai.\n\n\nBa.");
        assertTrue(h.contains("<p>Một.</p><p>Hai.</p><p>Ba.</p>"));
        assertTrue(h.contains("<title>Chapter 1</title>"));
        assertFalse(h.contains("<h1"));
    }

    @Test
    void htmlConvertsEmphasisAndEscapes() {
        String h = html("T", "**EMI** & *Đã nhận.* <b>\n5 * 3 *mở");
        assertTrue(h.contains("<p><strong>EMI</strong> &amp; <em>Đã nhận.</em> &lt;b&gt;</p>"));
        assertTrue(h.contains("<p>5 * 3 *mở</p>"));
    }

    @Test
    void htmlDropsImageMarkersKeepsSceneBreaks() {
        String h = html("T", "A\n\n  [[image:4]]  \n\n---\n\nB\r\nC");
        assertTrue(h.contains("<p>A</p><p>---</p><p>B</p><p>C</p>"));
        assertFalse(h.contains("image") || h.contains("\r"));
    }
}
