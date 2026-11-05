package com.subtitlestudio.novel;

import org.springframework.stereotype.Component;

/** Placeholder until the notebook exists (plan Task 6 replaces it with NotebookService). */
@Component
class NoNotebookScheduler implements NotebookScheduler {

    @Override
    public void scheduleUpdate(long novelId, int chapterNo) {
        // nothing yet
    }
}
