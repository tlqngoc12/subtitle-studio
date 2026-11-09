package com.subtitlestudio.profile;

/** Adds an uploaded image to the banner; {@code altText} is optional. */
public record BannerImageRequest(Long mediaId, String altText) {
}
