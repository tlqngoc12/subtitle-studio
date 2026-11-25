package com.subtitlestudio.novel;

/**
 * Another chapter of the novel is translating; only one runs at a time. {@code chapterNo} names that chapter.
 */
public class NovelTranslationBusyException extends RuntimeException {

    public enum Reason { CHAPTER_TRANSLATING }

    private final long novelId;
    private final Reason reason;
    private final int chapterNo;

    private final String chapterTitle;

    public NovelTranslationBusyException(long novelId, Reason reason, int chapterNo) {
        this(novelId, reason, chapterNo, null);
    }

    public NovelTranslationBusyException(long novelId, Reason reason, int chapterNo, String chapterTitle) {
        super((chapterTitle == null || chapterTitle.isBlank() ? "A chapter" : chapterTitle) + " is still translating.");
        this.novelId = novelId;
        this.reason = reason;
        this.chapterNo = chapterNo;
        this.chapterTitle = chapterTitle == null || chapterTitle.isBlank() ? null : chapterTitle;
    }

    /** The title of the translating chapter, or null. */
    public String chapterTitle() {
        return chapterTitle;
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
