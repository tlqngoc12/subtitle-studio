package com.subtitlestudio.profile;

import java.util.List;

/** A block as the API returns it; {@code mediaUrl} is set whenever {@code mediaId} is. */
public record BlockDto(long id, BlockType type, String title, String body, Long mediaId, String mediaUrl,
                       String caption, String embedUrl, List<ItemDto> items) {
}
