package com.subtitlestudio.novel;

import java.util.List;

/**
 * The story notebook (spec section 5): fixed facts that are only ever added or corrected (glossary, addressing),
 * and the parts the story changes (characters, summary, recent chapters).
 */
public record NotebookContent(List<GlossaryEntry> glossary, List<AddressingRule> addressing,
                              List<NotebookCharacter> characters, String storySoFar,
                              List<ChapterNote> recentChapters) {

    public static final NotebookContent EMPTY = new NotebookContent(List.of(), List.of(), List.of(), "", List.of());

    public NotebookContent {
        glossary = glossary == null ? List.of() : List.copyOf(glossary);
        addressing = addressing == null ? List.of() : List.copyOf(addressing);
        characters = characters == null ? List.of() : List.copyOf(characters);
        storySoFar = storySoFar == null ? "" : storySoFar;
        recentChapters = recentChapters == null ? List.of() : List.copyOf(recentChapters);
    }

    /** A Thai name or term and its fixed Vietnamese form. Key: {@code source}. */
    public record GlossaryEntry(String source, String target, String note) {}

    /** How {@code from} addresses {@code to}. Key: ({@code from}, {@code to}). */
    public record AddressingRule(String from, String to, String rule) {}

    /** {@code lastUpdatedChapter} is set by the app, not by Gemini. */
    public record NotebookCharacter(String name, String sourceName, String profile, String currentState,
                                    int lastUpdatedChapter) {}

    public record ChapterNote(int chapterNo, String summary) {}
}
