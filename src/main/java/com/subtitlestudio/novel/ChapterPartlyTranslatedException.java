package com.subtitlestudio.novel;

import com.subtitlestudio.translate.TranslationFailedException;
import java.util.List;

/** A batch that failed after some of its pages were already translated: those pages are kept, not paid for again. */
public class ChapterPartlyTranslatedException extends TranslationFailedException {

    private final List<TranslatedPage> done;

    public ChapterPartlyTranslatedException(String userMessage, List<TranslatedPage> done) {
        super(userMessage);
        this.done = List.copyOf(done);
    }

    public List<TranslatedPage> done() {
        return done;
    }
}
