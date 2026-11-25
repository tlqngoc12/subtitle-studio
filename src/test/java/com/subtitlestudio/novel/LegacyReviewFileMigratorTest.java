package com.subtitlestudio.novel;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LegacyReviewFileMigratorTest {

    private static ChapterRow row(long id, String title) {
        return new ChapterRow(id, (int) id, title, ChapterTranslationStatus.NONE, null, null,
                ChapterPublishStatus.DRAFT);
    }

    @Test
    void mapsReadingPositionsOfEachProfiledNovel() {
        NovelRepository novels = mock(NovelRepository.class);
        ChapterRepository chapters = mock(ChapterRepository.class);
        ChapterReviewFiles files = mock(ChapterReviewFiles.class);
        Novel profiled = mock(Novel.class);
        when(profiled.getId()).thenReturn(1L);
        when(profiled.getPromptProfile()).thenReturn("BH");
        Novel plain = mock(Novel.class);
        when(plain.getPromptProfile()).thenReturn(null);
        when(novels.findAll()).thenReturn(List.of(profiled, plain));
        when(chapters.findRowsByNovel(1L)).thenReturn(List.of(row(1, "Nhân vật"), row(2, "Chương 1: A")));

        new LegacyReviewFileMigrator(novels, chapters, files).migrate();

        verify(files).migrateLegacy("BH", Map.of(1, "nhan-vat", 2, "ch-1"));
        verify(files, never()).migrateLegacy(org.mockito.ArgumentMatchers.eq(null), any());
    }
}
