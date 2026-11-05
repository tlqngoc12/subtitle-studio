package com.subtitlestudio.novel;

import com.subtitlestudio.novel.NotebookContent.AddressingRule;
import com.subtitlestudio.novel.NotebookContent.GlossaryEntry;
import com.subtitlestudio.novel.NotebookContent.NotebookCharacter;
import java.util.List;

/** What Gemini proposes after reading a chapter: upserts for the fixed parts, rewrites for the rest. */
public record NotebookUpdate(List<GlossaryEntry> glossaryUpserts, List<AddressingRule> addressingUpserts,
                             List<NotebookCharacter> characters, String storySoFar, String chapterSummary) {
}
