package com.subtitlestudio.novel;

/** A published chapter only takes text and title edits; pages, order, number and translation need Unpublish first. */
public class ChapterPublishedException extends RuntimeException {

    public ChapterPublishedException(long chapterId) {
        super("Chapter " + chapterId + " is published: only its text can be edited");
    }
}
