package com.subtitlestudio.common;

import com.subtitlestudio.url.InvalidUrlException;
import com.subtitlestudio.url.UrlParser;
import java.util.Optional;

/**
 * The 11-character id of a YouTube video link ({@code youtu.be/ID}, {@code youtube.com/watch?v=ID}, {@code /shorts/ID},
 * {@code /embed/ID}; hosts {@code www.}, {@code m.} or none; extra query parameters ignored) or a bare 11-character id.
 * Shared by the novel trailer and the work trailer.
 */
public final class YouTubeIds {

    private static final UrlParser PARSER = new UrlParser();

    private YouTubeIds() {
    }

    public static Optional<String> videoId(String url) {
        if (url == null || url.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(PARSER.parse(url.strip()));
        } catch (InvalidUrlException e) {
            return Optional.empty();
        }
    }
}
