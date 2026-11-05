package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class ChapterBatchesTest {

    private static final long MB = 1024 * 1024;

    private static List<PageImage> pages(int count, int bytes) {
        return IntStream.rangeClosed(1, count).mapToObj(i -> new PageImage(i, new byte[bytes])).toList();
    }

    private static List<Integer> sizes(List<List<PageImage>> batches) {
        return batches.stream().map(List::size).toList();
    }

    @Test
    void splitsByPageCount() {
        assertThat(sizes(ChapterBatches.split(pages(45, 10), 20, 15 * MB))).containsExactly(20, 20, 5);
        assertThat(sizes(ChapterBatches.split(pages(20, 10), 20, 15 * MB))).containsExactly(20);
    }

    @Test
    void splitsByBytes() {
        assertThat(sizes(ChapterBatches.split(pages(5, (int) (6 * MB)), 20, 15 * MB))).containsExactly(2, 2, 1);
    }

    @Test
    void oversizedPageGoesAlone() {
        assertThat(sizes(ChapterBatches.split(pages(1, (int) (20 * MB)), 20, 15 * MB))).containsExactly(1);
    }

    @Test
    void keepsPageOrder() {
        List<List<PageImage>> batches = ChapterBatches.split(pages(5, 10), 2, 15 * MB);

        assertThat(batches.stream().flatMap(List::stream).map(PageImage::page)).containsExactly(1, 2, 3, 4, 5);
    }
}
