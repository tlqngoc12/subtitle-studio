package com.subtitlestudio.profile;

import java.time.Instant;
import java.util.List;

/**
 * A profile with its header fields, blocks and banner images, each in display order. The public export nulls
 * {@code portraitMediaId} and swaps {@code portraitUrl} for the public one.
 */
public record ProfileDto(String slug, String displayName, ProfileKind kind, String tagline, String fullName,
                         Long portraitMediaId, String portraitUrl, Instant updatedAt, List<BlockDto> blocks,
                         List<BannerImageDto> banner) {
}
