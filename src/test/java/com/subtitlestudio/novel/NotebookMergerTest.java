package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.novel.NotebookContent.AddressingRule;
import com.subtitlestudio.novel.NotebookContent.ChapterNote;
import com.subtitlestudio.novel.NotebookContent.GlossaryEntry;
import com.subtitlestudio.novel.NotebookContent.NotebookCharacter;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class NotebookMergerTest {

    private static NotebookCharacter ch(String name, String state, int chapter) {
        return new NotebookCharacter(name, "ชื่อ" + name, "hiền", state, chapter);
    }

    private static NotebookUpdate update(List<GlossaryEntry> glossary, List<AddressingRule> addressing,
                                         List<NotebookCharacter> characters) {
        return new NotebookUpdate(glossary, addressing, characters, "Tóm tắt", "Chương này");
    }

    @Test
    void glossaryUpsertNeverDeletes() {
        NotebookContent old = new NotebookContent(List.of(new GlossaryEntry("A", "a", null),
                new GlossaryEntry("B", "b", null)), List.of(), List.of(), "x", List.of());

        NotebookContent merged = NotebookMerger.merge(old, update(List.of(new GlossaryEntry("B", "b2", "sửa"),
                new GlossaryEntry("C", "c", null)), List.of(), List.of()), 2);

        assertThat(merged.glossary()).containsExactly(new GlossaryEntry("A", "a", null),
                new GlossaryEntry("B", "b2", "sửa"), new GlossaryEntry("C", "c", null));
    }

    @Test
    void addressingKeyIsFromTo() {
        NotebookContent old = new NotebookContent(List.of(), List.of(new AddressingRule("A", "B", "anh-em"),
                new AddressingRule("B", "A", "em-anh")), List.of(), "x", List.of());

        NotebookContent merged = NotebookMerger.merge(old, update(List.of(),
                List.of(new AddressingRule("A", "B", "tao-mày")), List.of()), 2);

        assertThat(merged.addressing()).containsExactly(new AddressingRule("A", "B", "tao-mày"),
                new AddressingRule("B", "A", "em-anh"));
    }

    @Test
    void charactersReplaceByNameAndKeepMissingOnes() {
        NotebookContent old = new NotebookContent(List.of(), List.of(), List.of(ch("Mai", "vui", 1),
                ch("Nam", "buồn", 1)), "x", List.of());

        NotebookContent merged = NotebookMerger.merge(old, update(List.of(), List.of(),
                List.of(ch("Nam", "giận", 0), ch("Lan", "lo", 0))), 3);

        assertThat(merged.characters()).containsExactly(ch("Mai", "vui", 1), ch("Nam", "giận", 3),
                ch("Lan", "lo", 3));
    }

    @Test
    void capsAt30KeepingMostRecentlyUpdated() {
        List<NotebookCharacter> many = new ArrayList<>(IntStream.range(0, 30).mapToObj(i -> ch("C" + i, "s", i))
                .toList());
        NotebookContent old = new NotebookContent(List.of(), List.of(), many, "x", List.of());

        NotebookContent merged = NotebookMerger.merge(old, update(List.of(), List.of(),
                List.of(ch("New", "s", 0))), 40);

        assertThat(merged.characters()).hasSize(30);
        assertThat(merged.characters()).extracting(NotebookCharacter::name).doesNotContain("C0").contains("New");
    }

    @Test
    void recentChaptersKeepsLast3ByNumber() {
        NotebookContent old = new NotebookContent(List.of(), List.of(), List.of(), "x",
                List.of(new ChapterNote(4, "bốn"), new ChapterNote(5, "năm"), new ChapterNote(6, "sáu")));

        NotebookContent seven = NotebookMerger.merge(old, update(List.of(), List.of(), List.of()), 7);
        assertThat(seven.recentChapters()).extracting(ChapterNote::chapterNo).containsExactly(5, 6, 7);

        NotebookContent five = NotebookMerger.merge(old, new NotebookUpdate(List.of(), List.of(), List.of(), "x",
                "năm mới"), 5);
        assertThat(five.recentChapters()).containsExactly(new ChapterNote(4, "bốn"), new ChapterNote(5, "năm mới"),
                new ChapterNote(6, "sáu"));
        assertThat(five.storySoFar()).isEqualTo("x");
    }

    @Test
    void rejectsTooLong() {
        assertThatThrownBy(() -> NotebookMerger.merge(NotebookContent.EMPTY,
                new NotebookUpdate(List.of(), List.of(), List.of(), "x".repeat(2_501), "c"), 1))
                .isInstanceOf(InvalidNotebookUpdateException.class).hasMessageContaining("storySoFar");
        assertThatThrownBy(() -> NotebookMerger.merge(NotebookContent.EMPTY, new NotebookUpdate(List.of(), List.of(),
                List.of(new NotebookCharacter("A", null, "x".repeat(301), "s", 0)), "x", "c"), 1))
                .isInstanceOf(InvalidNotebookUpdateException.class).hasMessageContaining("profile");
        assertThatThrownBy(() -> NotebookMerger.merge(NotebookContent.EMPTY,
                new NotebookUpdate(List.of(), List.of(), List.of(), "x", "c".repeat(801)), 1))
                .isInstanceOf(InvalidNotebookUpdateException.class).hasMessageContaining("chapterSummary");
    }

    @Test
    void rejectsNullStorySoFar() {
        assertThatThrownBy(() -> NotebookMerger.merge(NotebookContent.EMPTY,
                new NotebookUpdate(null, null, null, null, "c"), 1))
                .isInstanceOf(InvalidNotebookUpdateException.class).hasMessageContaining("storySoFar");
    }

    @Test
    void nullListsAreEmpty() {
        NotebookContent merged = NotebookMerger.merge(NotebookContent.EMPTY,
                new NotebookUpdate(null, null, null, "Tóm", "Chương 1"), 1);

        assertThat(merged.glossary()).isEmpty();
        assertThat(merged.recentChapters()).containsExactly(new ChapterNote(1, "Chương 1"));
    }
}
