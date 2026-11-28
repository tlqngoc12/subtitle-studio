package com.subtitlestudio.novel.wattpad;

import java.util.List;

/** The parts the user chose to sync; a null {@code chapterId} means "add a new chapter for this part". */
public record WattpadSyncRequest(List<Item> items) {

    public record Item(String partId, Long chapterId) {
    }
}
