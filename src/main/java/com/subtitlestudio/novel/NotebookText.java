package com.subtitlestudio.novel;

import com.subtitlestudio.novel.NotebookContent.AddressingRule;
import com.subtitlestudio.novel.NotebookContent.ChapterNote;
import com.subtitlestudio.novel.NotebookContent.GlossaryEntry;
import com.subtitlestudio.novel.NotebookContent.NotebookCharacter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * The notebook as Markdown for Gemini. When it is longer than {@code maxChars}, the characters updated longest ago
 * are left out first; glossary and addressing always stay. The stored notebook is not changed.
 */
final class NotebookText {

    static final int MAX_CHARS = 12_000;

    private NotebookText() {
    }

    static String render(NotebookContent content, int maxChars) {
        List<NotebookCharacter> characters = new ArrayList<>(content.characters());
        String text = render(content, characters);
        while (text.length() > maxChars && !characters.isEmpty()) {
            characters.remove(characters.stream().min(Comparator.comparingInt(NotebookCharacter::lastUpdatedChapter))
                    .orElseThrow());
            text = render(content, characters);
        }
        return text.length() > maxChars ? text.substring(0, maxChars) : text;
    }

    private static String render(NotebookContent c, List<NotebookCharacter> characters) {
        StringBuilder sb = new StringBuilder();
        if (!c.addressing().isEmpty()) {
            sb.append("## Xưng hô\n");
            for (AddressingRule a : c.addressing()) {
                sb.append("- ").append(a.from()).append(" → ").append(a.to()).append(": ").append(a.rule())
                        .append('\n');
            }
            sb.append('\n');
        }
        if (!c.glossary().isEmpty()) {
            sb.append("## Thuật ngữ và tên riêng\n");
            for (GlossaryEntry g : c.glossary()) {
                sb.append("- ").append(g.source()).append(" → ").append(g.target());
                if (g.note() != null && !g.note().isBlank()) {
                    sb.append(" (").append(g.note()).append(')');
                }
                sb.append('\n');
            }
            sb.append('\n');
        }
        if (!characters.isEmpty()) {
            sb.append("## Nhân vật\n");
            for (NotebookCharacter ch : characters) {
                sb.append("### ").append(ch.name());
                if (ch.sourceName() != null && !ch.sourceName().isBlank()) {
                    sb.append(" (").append(ch.sourceName()).append(')');
                }
                sb.append('\n');
                if (ch.profile() != null && !ch.profile().isBlank()) {
                    sb.append(ch.profile()).append('\n');
                }
                if (ch.currentState() != null && !ch.currentState().isBlank()) {
                    sb.append("Hiện tại: ").append(ch.currentState()).append('\n');
                }
            }
            sb.append('\n');
        }
        if (!c.storySoFar().isBlank()) {
            sb.append("## Tóm tắt\n").append(c.storySoFar()).append("\n\n");
        }
        if (!c.recentChapters().isEmpty()) {
            sb.append("## Các chương gần đây\n");
            for (ChapterNote n : c.recentChapters()) {
                sb.append("- Chương ").append(n.chapterNo()).append(": ").append(n.summary()).append('\n');
            }
        }
        return sb.toString().strip();
    }
}
