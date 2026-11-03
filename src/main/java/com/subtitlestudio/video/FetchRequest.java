package com.subtitlestudio.video;

/**
 * Body of {@code POST /api/videos}. Validation happens in {@code UrlParser}, so a missing url yields INVALID_URL.
 * {@code profile} (optional) names the translation profile to translate with after fetching.
 */
public record FetchRequest(String url, String profile) {}
