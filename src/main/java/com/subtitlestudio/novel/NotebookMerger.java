package com.subtitlestudio.novel;

import com.subtitlestudio.novel.NotebookContent.AddressingRule;
import com.subtitlestudio.novel.NotebookContent.ChapterNote;
import com.subtitlestudio.novel.NotebookContent.GlossaryEntry;
import com.subtitlestudio.novel.NotebookContent.NotebookCharacter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Applies Gemini's {@link NotebookUpdate} to a notebook (spec section 5). The app, not Gemini, decides what is kept:
 * glossary and addressing entries are never deleted; characters missing from the update stay.
 */
final class NotebookMerger {

    static final int MAX_CHARACTERS = 30;
    static final int MAX_CHARACTER_FIELD = 300;
    static final int MAX_STORY = 2_500;
    static final int MAX_CHAPTER_SUMMARY = 800;
    static final int RECENT_CHAPTERS = 3;
    /** Character name (Vietnamese), its original-language name, glossary source/target, notes and addressing. */
    static final int MAX_NAME = 80;
    static final int MAX_SOURCE_NAME = 120;
    static final int MAX_TERM = 120;
    static final int MAX_NOTE = 300;
    static final int MAX_PERSON = 80;

    private NotebookMerger() {
    }

    static NotebookContent merge(NotebookContent stored, NotebookUpdate update, int chapterNo) {
        check(update);
        NotebookContent old = sanitize(stored);

        Map<String, GlossaryEntry> glossary = new LinkedHashMap<>();
        old.glossary().forEach(g -> glossary.put(g.source(), g));
        list(update.glossaryUpserts()).stream().filter(g -> notBlank(g.source()) && notBlank(g.target()))
                .forEach(g -> glossary.put(g.source(), g));

        Map<String, AddressingRule> addressing = new LinkedHashMap<>();
        old.addressing().forEach(a -> addressing.put(a.from() + "\u0000" + a.to(), a));
        list(update.addressingUpserts()).stream()
                .filter(a -> notBlank(a.from()) && notBlank(a.to()) && notBlank(a.rule()))
                .forEach(a -> addressing.put(a.from() + "\u0000" + a.to(), a));

        Map<String, NotebookCharacter> characters = new LinkedHashMap<>();
        old.characters().forEach(c -> characters.put(c.name(), c));
        list(update.characters()).stream().filter(c -> notBlank(c.name()))
                .forEach(c -> characters.put(c.name(), new NotebookCharacter(c.name(), c.sourceName(), c.profile(),
                        c.currentState(), chapterNo)));
        List<NotebookCharacter> kept = new ArrayList<>(characters.values());
        if (kept.size() > MAX_CHARACTERS) {
            List<NotebookCharacter> newest = kept.stream()
                    .sorted(Comparator.comparingInt(NotebookCharacter::lastUpdatedChapter).reversed())
                    .limit(MAX_CHARACTERS).toList();
            kept.retainAll(newest);
        }

        Map<Integer, ChapterNote> recent = new LinkedHashMap<>();
        old.recentChapters().forEach(n -> recent.put(n.chapterNo(), n));
        recent.put(chapterNo, new ChapterNote(chapterNo, update.chapterSummary()));
        List<ChapterNote> notes = recent.values().stream().sorted(Comparator.comparingInt(ChapterNote::chapterNo))
                .toList();
        notes = notes.subList(Math.max(0, notes.size() - RECENT_CHAPTERS), notes.size());

        return new NotebookContent(new ArrayList<>(glossary.values()), new ArrayList<>(addressing.values()), kept,
                update.storySoFar(), notes);
    }

    /**
     * Drops what a runaway Gemini answer left in stored content: a {@code sourceName} over its limit becomes null
     * (the Vietnamese name stays), and glossary or addressing entries with an over-long field are removed. Pure and
     * idempotent; applied whenever stored content is read.
     */
    static NotebookContent sanitize(NotebookContent content) {
        List<GlossaryEntry> glossary = content.glossary().stream()
                .filter(g -> fits(g.source(), MAX_TERM) && fits(g.target(), MAX_TERM) && fits(g.note(), MAX_NOTE))
                .toList();
        List<AddressingRule> addressing = content.addressing().stream()
                .filter(a -> fits(a.from(), MAX_PERSON) && fits(a.to(), MAX_PERSON) && fits(a.rule(), MAX_NOTE))
                .toList();
        List<NotebookCharacter> characters = content.characters().stream()
                .map(c -> fits(c.sourceName(), MAX_SOURCE_NAME) ? c : new NotebookCharacter(c.name(), null,
                        c.profile(), c.currentState(), c.lastUpdatedChapter()))
                .toList();
        return new NotebookContent(glossary, addressing, characters, content.storySoFar(), content.recentChapters());
    }

    private static boolean fits(String value, int max) {
        return value == null || value.length() <= max;
    }

    private static void check(NotebookUpdate u) {
        if (u.storySoFar() == null || u.storySoFar().isBlank()) {
            throw new InvalidNotebookUpdateException("Gemini left out storySoFar.");
        }
        tooLong("storySoFar", u.storySoFar(), MAX_STORY);
        if (u.chapterSummary() == null || u.chapterSummary().isBlank()) {
            throw new InvalidNotebookUpdateException("Gemini left out chapterSummary.");
        }
        tooLong("chapterSummary", u.chapterSummary(), MAX_CHAPTER_SUMMARY);
        for (NotebookCharacter c : list(u.characters())) {
            tooLong("name", c.name(), MAX_NAME);
            tooLong("sourceName", c.sourceName(), MAX_SOURCE_NAME);
            tooLong("profile", c.profile(), MAX_CHARACTER_FIELD);
            tooLong("currentState", c.currentState(), MAX_CHARACTER_FIELD);
        }
        for (GlossaryEntry g : list(u.glossaryUpserts())) {
            tooLong("glossary source", g.source(), MAX_TERM);
            tooLong("glossary target", g.target(), MAX_TERM);
            tooLong("glossary note", g.note(), MAX_NOTE);
        }
        for (AddressingRule a : list(u.addressingUpserts())) {
            tooLong("addressing from", a.from(), MAX_PERSON);
            tooLong("addressing to", a.to(), MAX_PERSON);
            tooLong("addressing rule", a.rule(), MAX_NOTE);
        }
    }

    private static void tooLong(String field, String value, int max) {
        if (value != null && value.length() > max) {
            throw new InvalidNotebookUpdateException(
                    "Gemini's notebook " + field + " is too long (" + value.length() + " > " + max + ").");
        }
    }

    private static <T> List<T> list(List<T> values) {
        return values == null ? List.of() : values.stream().filter(v -> v != null).toList();
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
