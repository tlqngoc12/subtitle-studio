package com.subtitlestudio.novel;

/**
 * Another chapter of the novel is translating, or its notebook is updating; only one runs at a time. {@code reason}
 * says which, and {@code chapterNo} names the chapter that is translating, or the one the notebook is updating after.
 */
public class NovelTranslationBusyException extends RuntimeException {

    public enum Reason { CHAPTER_TRANSLATING, NOTEBOOK_UPDATING }

    private final long novelId;
    private final Reason reason;
    private final int chapterNo;

    public NovelTranslationBusyException(long novelId, Reason reason, int chapterNo) {
        super(reason == Reason.CHAPTER_TRANSLATING
                ? "Chapter " + chapterNo + " is still translating."
                : "The notebook is still updating after chapter " + chapterNo + ".");
        this.novelId = novelId;
        this.reason = reason;
        this.chapterNo = chapterNo;
    }

    public long novelId() {
        return novelId;
    }

    public Reason reason() {
        return reason;
    }

    public int chapterNo() {
        return chapterNo;
    }
}
