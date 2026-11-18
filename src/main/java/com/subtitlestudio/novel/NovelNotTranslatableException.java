package com.subtitlestudio.novel;

/** The operation translates text, but the novel is an original story (the user's own writing). */
public class NovelNotTranslatableException extends RuntimeException {

    public static final String CODE = "NOVEL_NOT_TRANSLATABLE";

    public NovelNotTranslatableException(long novelId) {
        super("Novel " + novelId + " is an original story; there is nothing to translate");
    }
}
