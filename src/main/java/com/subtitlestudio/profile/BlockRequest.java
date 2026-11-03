package com.subtitlestudio.profile;

import java.util.List;

/** Body of POST/PUT block requests; fields that do not belong to {@code type} are ignored. */
public record BlockRequest(BlockType type, String title, String body, Long mediaId, String caption, String embedUrl,
                           List<ItemRequest> items) {
}
