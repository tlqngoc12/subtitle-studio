package com.subtitlestudio.novel.wattpad;

import java.util.List;

/** What a bulk sync did: chapters whose text was replaced, chapters added, and the parts that could not be done. */
public record WattpadSyncResult(int synced, int created, List<Failure> failed) {

    /** {@code code} is an API error code (the UI words it); {@code message} is the English reason. */
    public record Failure(String partId, String title, String code, String message) {
    }
}
