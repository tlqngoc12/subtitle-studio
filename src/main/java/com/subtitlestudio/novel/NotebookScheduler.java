package com.subtitlestudio.novel;

/** Starts a notebook update after chapter {@code chapterNo} was published or its published text changed. */
public interface NotebookScheduler {

    void scheduleUpdate(long novelId, int chapterNo);
}
