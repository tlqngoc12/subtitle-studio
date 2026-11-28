package com.subtitlestudio.novel.wattpad;

/** Where a Wattpad part stands against the chapter of an original story it matches (spec: bulk sync). */
public enum SyncStatus {
    /** Deleted on Wattpad: shown, never selectable. */
    DELETED,
    /** Its chapter is Published: shown, never selectable. */
    PUBLISHED,
    /** Synced before, text not edited in the app, no newer version on Wattpad: hidden, counted. */
    UP_TO_DATE,
    /** Synced before, text not edited in the app, Wattpad changed it since: selected by default. */
    UPDATED,
    /** Synced before but the text in the app differs from the synced one: not selected, warns. */
    LOCAL_EDITS,
    /** Matched by title only, never synced: not selected, warns. */
    NOT_SYNCED,
    /** No chapter matches: selected by default, would add a Draft chapter. */
    NEW_PART
}
