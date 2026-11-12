package com.subtitlestudio.novel;

import com.subtitlestudio.novel.wattpad.SceneBreak;
import java.util.ArrayList;
import java.util.List;

/**
 * Splits a chapter's original text in two for a second attempt: at the scene break closest to the middle, else at
 * the paragraph boundary closest to the middle. Never inside a paragraph, so never inside a sentence.
 */
final class TextSplitter {

    private TextSplitter() {
    }

    /** Paragraphs are separated by a blank line. */
    static List<String> paragraphs(String text) {
        List<String> out = new ArrayList<>();
        for (String p : text.strip().split("\\n\\s*\\n")) {
            if (!p.isBlank()) {
                out.add(p.strip());
            }
        }
        return out;
    }

    /** Two non-empty halves, or an empty list when the text is a single paragraph. */
    static List<String> split(String text) {
        List<String> paragraphs = paragraphs(text);
        if (paragraphs.size() < 2) {
            return List.of();
        }
        // end[i] = characters before paragraph i+1 (a split after paragraph i)
        int total = text.strip().length();
        int best = -1;
        long bestDistance = Long.MAX_VALUE;
        boolean bestIsBreak = false;
        int position = 0;
        boolean onlyBreaksSoFar = true;
        for (int i = 0; i < paragraphs.size() - 1; i++) {
            position += paragraphs.get(i).length() + 2;
            boolean paragraphIsBreak = SceneBreak.isBreak(paragraphs.get(i));
            onlyBreaksSoFar &= paragraphIsBreak;
            if (onlyBreaksSoFar) {
                continue; // a first half made only of scene breaks would carry no story
            }
            boolean isBreak = paragraphIsBreak;
            // a scene break is the separator: it stays with the first half, the split falls right after it
            long distance = Math.abs((long) position - total / 2);
            boolean better = best < 0 || (isBreak && !bestIsBreak) || (isBreak == bestIsBreak && distance < bestDistance);
            if (better) {
                best = i;
                bestDistance = distance;
                bestIsBreak = isBreak;
            }
        }
        if (best < 0) {
            return List.of();
        }
        return List.of(String.join("\n\n", paragraphs.subList(0, best + 1)),
                String.join("\n\n", paragraphs.subList(best + 1, paragraphs.size())));
    }
}
