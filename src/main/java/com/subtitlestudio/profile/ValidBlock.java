package com.subtitlestudio.profile;

import java.util.List;

/** A validated, normalised block: fields the type does not use are null, {@code items} is never null. */
public record ValidBlock(BlockType type, String title, String body, Long mediaId, String caption, String embedUrl,
                         List<ValidItem> items) {
}
