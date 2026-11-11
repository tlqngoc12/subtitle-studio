package com.subtitlestudio.fanfic;

import java.util.List;

/** Outcome of Refresh all: how many stories were updated and which ones failed (their old data is untouched). */
public record RefreshAllResult(int updated, List<Failure> failed) {

    public record Failure(long id, String title, String message) {
    }
}
