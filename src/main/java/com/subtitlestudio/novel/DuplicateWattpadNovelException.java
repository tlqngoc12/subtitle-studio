package com.subtitlestudio.novel;

/** A novel already exists for this Wattpad story; {@code novelId} is that novel. */
public class DuplicateWattpadNovelException extends RuntimeException {

    private final long novelId;

    public DuplicateWattpadNovelException(String title, long novelId) {
        this("This Wattpad story is already translated as “" + title + "”.", novelId, true);
    }

    private DuplicateWattpadNovelException(String message, long novelId, boolean unused) {
        super(message);
        this.novelId = novelId;
    }

    /** For an original story's Wattpad link: the story is linked, not translated. */
    public static DuplicateWattpadNovelException linked(String title, long novelId) {
        return new DuplicateWattpadNovelException("This Wattpad story is already linked to “" + title + "”.", novelId, true);
    }

    public long novelId() {
        return novelId;
    }
}
