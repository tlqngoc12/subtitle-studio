package com.subtitlestudio.profile;

import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * A banner image as the API and the public export return it. {@code mediaId} is only for the exporter, which
 * swaps {@code mediaUrl} for the public one; it is never serialised. {@code altText} may be null.
 */
public record BannerImageDto(long id, @JsonIgnore Long mediaId, String mediaUrl, String altText) {
}
