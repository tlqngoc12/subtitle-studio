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

    private static NotebookUpdate withCharacter(String name, String sourceName) {
        return new NotebookUpdate(List.of(), List.of(), List.of(new NotebookCharacter(name, sourceName, "p", "s", 0)),
                "x", "c");
    }

    private static NotebookUpdate withGlossary(String source, String target, String note) {
        return new NotebookUpdate(List.of(new GlossaryEntry(source, target, note)), List.of(), List.of(), "x", "c");
    }

    private static NotebookUpdate withAddressing(String from, String to, String rule) {
        return new NotebookUpdate(List.of(), List.of(new AddressingRule(from, to, rule)), List.of(), "x", "c");
    }

    private static void accepts(NotebookUpdate u) {
        NotebookMerger.merge(NotebookContent.EMPTY, u, 1);
    }

    private static void rejects(NotebookUpdate u, String field, int length, int max) {
        assertThatThrownBy(() -> accepts(u)).isInstanceOf(InvalidNotebookUpdateException.class)
                .hasMessageContaining(field).hasMessageContaining("(" + length + " > " + max + ")");
    }

    @Test
    void everyNewFieldLimitRejectsOneOverAndAcceptsExactlyTheLimit() {
        String ok80 = "a".repeat(80);
        String over80 = "a".repeat(81);
        accepts(withCharacter(ok80, "b".repeat(120)));
        rejects(withCharacter(over80, null), "name", 81, 80);
        rejects(withCharacter("Mai", "b".repeat(121)), "sourceName", 121, 120);

        accepts(withGlossary("s".repeat(120), "t".repeat(120), "n".repeat(300)));
        rejects(withGlossary("s".repeat(121), "t", null), "glossary source", 121, 120);
        rejects(withGlossary("s", "t".repeat(121), null), "glossary target", 121, 120);
        rejects(withGlossary("s", "t", "n".repeat(301)), "glossary note", 301, 300);

        accepts(withAddressing(ok80, ok80, "r".repeat(300)));
        rejects(withAddressing(over80, "b", "r"), "addressing from", 81, 80);
        rejects(withAddressing("a", over80, "r"), "addressing to", 81, 80);
        rejects(withAddressing("a", "b", "r".repeat(301)), "addressing rule", 301, 300);
    }

    @Test
    void mergingOntoALeakedSourceNameDropsItAndKeepsTheRest() {
        NotebookContent old = new NotebookContent(List.of(), List.of(),
                List.of(new NotebookCharacter("Bonnie", "x".repeat(8_831), "hiền", "vui", 2)), "x", List.of());

        NotebookContent merged = NotebookMerger.merge(old,
                new NotebookUpdate(List.of(), List.of(), List.of(), "Tóm", "c"), 3);

        assertThat(merged.characters()).containsExactly(new NotebookCharacter("Bonnie", null, "hiền", "vui", 2));
    }

    @Test
    void mergingDropsOverlongOldGlossaryAndAddressingEntries() {
        NotebookContent old = new NotebookContent(
                List.of(new GlossaryEntry("a".repeat(121), "x", null), new GlossaryEntry("A", "a", null)),
                List.of(new AddressingRule("A", "B", "r".repeat(301)), new AddressingRule("B", "A", "ok")),
                List.of(), "x", List.of());

        NotebookContent merged = NotebookMerger.merge(old,
                new NotebookUpdate(List.of(), List.of(), List.of(), "Tóm", "c"), 2);

        assertThat(merged.glossary()).containsExactly(new GlossaryEntry("A", "a", null));
        assertThat(merged.addressing()).containsExactly(new AddressingRule("B", "A", "ok"));
    }

    @Test
    void sanitizeIsIdempotent() {
        NotebookContent dirty = new NotebookContent(List.of(new GlossaryEntry("a".repeat(121), "x", null)), List.of(),
                List.of(new NotebookCharacter("B", "x".repeat(200), "p", "s", 1)), "x", List.of());

        NotebookContent once = NotebookMerger.sanitize(dirty);

        assertThat(NotebookMerger.sanitize(once)).isEqualTo(once);
    }

    @Test
    void nullListsAreEmpty() {
        NotebookContent merged = NotebookMerger.merge(NotebookContent.EMPTY,
                new NotebookUpdate(null, null, null, "Tóm", "Chương 1"), 1);

        assertThat(merged.glossary()).isEmpty();
        assertThat(merged.recentChapters()).containsExactly(new ChapterNote(1, "Chương 1"));
    }
}
