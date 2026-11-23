package com.subtitlestudio.novel;

/** No review file for the chapter; {@code pattern} is the file name searched, or null when the novel has no profile. */
public class ChapterReviewNotFoundException extends RuntimeException {

    private final String pattern;

    public ChapterReviewNotFoundException(String pattern) {
        super(pattern == null ? "No review file found (this novel has no profile)" : "No review file found (" + pattern + ")");
        this.pattern = pattern;
    }

    public String pattern() {
        return pattern;
    }
}
