package com.subtitlestudio.video;

/** Body of {@code POST /api/videos}. Validation happens in {@code UrlParser}, so a missing url yields INVALID_URL. */
public record FetchRequest(String url) {}
