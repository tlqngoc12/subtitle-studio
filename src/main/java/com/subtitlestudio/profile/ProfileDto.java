package com.subtitlestudio.profile;

import java.time.Instant;
import java.util.List;

/** A profile page with its blocks in display order. */
public record ProfileDto(String slug, String displayName, Instant updatedAt, List<BlockDto> blocks) {
}
