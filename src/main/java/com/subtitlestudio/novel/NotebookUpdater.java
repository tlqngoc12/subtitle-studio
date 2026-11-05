package com.subtitlestudio.novel;

import com.subtitlestudio.translate.TranslationFailedException;

/** Reads a published chapter and proposes changes to the story notebook. */
public interface NotebookUpdater {

    /**
     * @param notebookText the current notebook as text, or null before the first chapter
     * @throws TranslationFailedException with a message for the user
     */
    NotebookUpdate propose(String profile, String notebookText, int chapterNo, String chapterText);
}
