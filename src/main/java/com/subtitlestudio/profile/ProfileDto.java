package com.subtitlestudio.profile;

import java.time.Instant;
import java.util.List;

/** A profile page with its blocks and its banner images, each in display order. */
public record ProfileDto(String slug, String displayName, Instant updatedAt, List<BlockDto> blocks,
                         List<BannerImageDto> banner) {
}
