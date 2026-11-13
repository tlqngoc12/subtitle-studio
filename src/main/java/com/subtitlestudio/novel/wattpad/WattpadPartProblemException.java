package com.subtitlestudio.novel.wattpad;

/** A Wattpad part cannot be fetched: not in the story, deleted, or without text. Carries the API error code. */
public class WattpadPartProblemException extends RuntimeException {

    public static final String NOT_FOUND = "WATTPAD_PART_NOT_FOUND";
    public static final String DELETED = "WATTPAD_PART_DELETED";
    public static final String EMPTY = "WATTPAD_PART_EMPTY";

    private final String code;

    public WattpadPartProblemException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
