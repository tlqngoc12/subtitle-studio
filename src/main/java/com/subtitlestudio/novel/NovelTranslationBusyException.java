package com.subtitlestudio.novel;

/** Another chapter of the novel is translating, or its notebook is updating; only one runs at a time. */
public class NovelTranslationBusyException extends RuntimeException {

    public NovelTranslationBusyException(long novelId) {
        super("Another chapter of this novel is still translating, or the notebook is updating.");
    }
}
