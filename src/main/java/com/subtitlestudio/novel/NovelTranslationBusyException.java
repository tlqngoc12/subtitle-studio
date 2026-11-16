package com.subtitlestudio.novel;

/**
 * Another chapter of the novel is translating; only one runs at a time. {@code chapterNo} names that chapter.
 */
public class NovelTranslationBusyException extends RuntimeException {

    public enum Reason { CHAPTER_TRANSLATING }

    private final long novelId;
    private final Reason reason;
    private final int chapterNo;

    public NovelTranslationBusyException(long novelId, Reason reason, int chapterNo) {
        super("Chapter " + chapterNo + " is still translating.");
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
