package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.OptionalLong;
import org.junit.jupiter.api.Test;

class ImageMarkersTest {

    @Test
    void markerFormat() {
        assertThat(ImageMarkers.marker(42)).isEqualTo("[[image:42]]");
    }

    @Test
    void mediaIdReadsOnlyAWholeParagraph() {
        assertThat(ImageMarkers.mediaId("  [[image:42]] ")).isEqualTo(OptionalLong.of(42));
        assertThat(ImageMarkers.mediaId("see [[image:42]]")).isEmpty();
        assertThat(ImageMarkers.mediaId("[[image:x]]")).isEmpty();
        assertThat(ImageMarkers.mediaId("[[image:]]")).isEmpty();
        assertThat(ImageMarkers.mediaId(null)).isEmpty();
    }

    @Test
    void idsInOrder() {
        assertThat(ImageMarkers.ids("a\n\n[[image:1]]\n\nb\n\n[[image:2]]")).containsExactly(1L, 2L);
        assertThat(ImageMarkers.ids("no images")).isEqualTo(List.of());
        assertThat(ImageMarkers.ids(null)).isEqualTo(List.of());
    }

    @Test
    void idsIgnoreAMarkerInsideAParagraph() {
        assertThat(ImageMarkers.ids("a [[image:1]] b\n\n[[image:2]]")).containsExactly(2L);
    }

    @Test
    void stripRemovesMarkerParagraphs() {
        assertThat(ImageMarkers.strip("a\n\n[[image:1]]\n\nb\n\n[[image:2]]")).isEqualTo("a\n\nb");
        assertThat(ImageMarkers.strip("[[image:1]]\n\n[[image:2]]")).isEmpty();
    }

    @Test
    void stripLeavesTextWithoutMarkersUntouched() {
        String text = "a\n\n\n\nb\n";
        assertThat(ImageMarkers.strip(text)).isSameAs(text);
        assertThat(ImageMarkers.strip(null)).isNull();
    }

    @Test
    void hasMarkers() {
        assertThat(ImageMarkers.hasMarkers("a\n\n[[image:1]]")).isTrue();
        assertThat(ImageMarkers.hasMarkers("a")).isFalse();
        assertThat(ImageMarkers.hasMarkers(null)).isFalse();
    }

    @Test
    void restorePutsEverySourceMarkerBackAtItsPlace() {
        String source = "[[image:1]]\n\n[[image:2]]\n\nA\n\n[[image:3]]\n\nB\n\n[[image:4]]";
        assertThat(ImageMarkers.restore(source, "a\n\nb")).contains(
                "[[image:1]]\n\n[[image:2]]\n\na\n\n[[image:3]]\n\nb\n\n[[image:4]]");
        assertThat(ImageMarkers.restore(source, "[[image:4]]\n\na\n\n[[image:1]]\n\nb")).contains(
                "[[image:1]]\n\n[[image:2]]\n\na\n\n[[image:3]]\n\nb\n\n[[image:4]]");
    }

    @Test
    void restoreRefusesWhenItCannotAlign() {
        String source = "A\n\n[[image:1]]\n\nB";
        assertThat(ImageMarkers.restore(source, "a")).isEmpty();
        assertThat(ImageMarkers.restore(source, "a\n\nb\n\nc")).isEmpty();
        assertThat(ImageMarkers.restore(source, "a\n\n[[image:9]]\n\nb")).isEmpty();
        assertThat(ImageMarkers.restore(source, "a\n\n[[image:1]]\n\n[[image:1]]\n\nb")).isEmpty();
    }
}
