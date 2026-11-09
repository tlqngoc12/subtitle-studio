package com.subtitlestudio.video;

import java.time.Instant;
import java.util.List;

/**
 * The live editor's save: the new text of every stored Vietsub line, in order. {@code baseUpdatedAt} is the
 * {@code viUpdatedAt} the editor loaded; if the stored value differs, the save is refused.
 */
public record VietsubTextRequest(Instant baseUpdatedAt, List<LineText> lines) {

    /** {@code idx} is the 0-based position of the line. */
    public record LineText(int idx, String text) {}
}
