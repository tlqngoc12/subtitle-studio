package com.subtitlestudio.novel;

/** The story notebook as text for translating chapter {@code chapterNo}: the latest version before it, or null. */
public interface NotebookPromptSource {

    String textBefore(long novelId, int chapterNo);
}
