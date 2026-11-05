package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.profile.Media;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class ChapterTextTest {

    private static final Instant T = Instant.parse("2026-11-05T10:00:00Z");
    private final Chapter chapter = new Chapter(new Novel("n", "N", NovelStatus.ONGOING, T), 1, null, T);

    private ChapterPage page(int position, String text) {
        ChapterPage p = new ChapterPage(chapter, position, new Media("image/png", 1, "p.png", T));
        p.setTextVi(text);
        return p;
    }

    @Test
    void joinsPageTextsUntilTheWholeChapterIsEdited() {
        List<ChapterPage> pages = List.of(page(1, "Một"), page(2, "Hai"));

        assertThat(ChapterText.of(chapter, pages)).isEqualTo("Một\n\nHai");
        assertThat(ChapterText.complete(chapter, pages)).isTrue();

        chapter.setTextVi("Cả chương đã sửa");
        assertThat(ChapterText.of(chapter, pages)).isEqualTo("Cả chương đã sửa");
    }

    @Test
    void pagesWithoutTextAreIncompleteUnlessTheChapterTextIsSet() {
        List<ChapterPage> pages = List.of(page(1, "Một"), page(2, null));

        assertThat(ChapterText.complete(chapter, pages)).isFalse();
        assertThat(ChapterText.of(chapter, pages)).isEqualTo("Một");

        chapter.setTextVi("Cả chương");
        assertThat(ChapterText.complete(chapter, pages)).isTrue();
    }

    @Test
    void emptyChapterIsIncomplete() {
        assertThat(ChapterText.complete(chapter, List.of())).isFalse();
        assertThat(ChapterText.of(chapter, List.of())).isEmpty();
    }
}
