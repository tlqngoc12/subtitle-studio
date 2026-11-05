package com.subtitlestudio.novel;

import org.springframework.stereotype.Component;

/** Placeholder until the notebook exists (plan Task 6 replaces it with NotebookService). */
@Component
class NoNotebookPromptSource implements NotebookPromptSource {

    @Override
    public String textBefore(long novelId, int chapterNo) {
        return null;
    }
}
