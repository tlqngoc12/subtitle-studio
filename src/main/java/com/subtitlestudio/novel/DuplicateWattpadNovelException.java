package com.subtitlestudio.novel;

/** A novel already exists for this Wattpad story; {@code novelId} is that novel. */
public class DuplicateWattpadNovelException extends RuntimeException {

    private final long novelId;

    public DuplicateWattpadNovelException(String title, long novelId) {
        super("This Wattpad story is already translated as “" + title + "”.");
        this.novelId = novelId;
    }

    public long novelId() {
        return novelId;
    }
}
