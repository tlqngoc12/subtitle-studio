package com.subtitlestudio.novel;

/** Fetch and translate was asked for a chapter that already has a translation. */
public class ChapterAlreadyTranslatedException extends RuntimeException {

    public ChapterAlreadyTranslatedException(long chapterId) {
        super("This chapter is already translated. Use Translate again on the chapter page.");
    }
}
