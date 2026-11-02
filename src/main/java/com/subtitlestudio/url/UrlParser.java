package com.subtitlestudio.url;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Extracts the 11-character YouTube video id from a URL or a bare id.
 *
 * <p>The returned id is passed to yt-dlp, so it is strictly validated against
 * {@code ^[A-Za-z0-9_-]{11}$}; anything else raises {@link InvalidUrlException}.
 */
@Component
public class UrlParser {

    private static final Pattern VIDEO_ID = Pattern.compile("^[A-Za-z0-9_-]{11}$");
    private static final Pattern HAS_SCHEME = Pattern.compile("^[A-Za-z][A-Za-z0-9+.-]*://.*");
    private static final Set<String> YOUTUBE_HOSTS = Set.of("youtube.com", "www.youtube.com", "m.youtube.com");
    private static final String SHORT_HOST = "youtu.be";

    public String parse(String input) {
        if (input == null || input.isBlank()) {
            throw new InvalidUrlException(String.valueOf(input));
        }
        String trimmed = input.strip();
        if (VIDEO_ID.matcher(trimmed).matches()) {
            return trimmed;
        }

        URI uri = toUri(trimmed, input);
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("https") && !scheme.equals("http")) {
            throw new InvalidUrlException(input);
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        String[] segments = pathSegments(uri);

        String candidate;
        if (host.equals(SHORT_HOST)) {
            candidate = segments.length >= 1 ? segments[0] : null;
        } else if (YOUTUBE_HOSTS.contains(host)) {
            candidate = fromYoutubePath(segments, uri.getRawQuery());
        } else {
            candidate = null;
        }

        if (candidate == null || !VIDEO_ID.matcher(candidate).matches()) {
            throw new InvalidUrlException(input);
        }
        return candidate;
    }

    private static URI toUri(String trimmed, String original) {
        String withScheme = HAS_SCHEME.matcher(trimmed).matches() ? trimmed : "https://" + trimmed;
        try {
            return new URI(withScheme);
        } catch (URISyntaxException e) {
            throw new InvalidUrlException(original);
        }
    }

    private static String[] pathSegments(URI uri) {
        String path = uri.getRawPath();
        if (path == null || path.isEmpty() || path.equals("/")) {
            return new String[0];
        }
        String stripped = path.startsWith("/") ? path.substring(1) : path;
        return stripped.split("/");
    }

    private static String fromYoutubePath(String[] segments, String rawQuery) {
        if (segments.length == 1 && segments[0].equals("watch")) {
            return queryParam(rawQuery, "v");
        }
        if (segments.length >= 2 && (segments[0].equals("shorts") || segments[0].equals("embed"))) {
            return segments[1];
        }
        return null;
    }

    private static String queryParam(String rawQuery, String name) {
        if (rawQuery == null) {
            return null;
        }
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && pair.substring(0, eq).equals(name)) {
                return pair.substring(eq + 1);
            }
        }
        return null;
    }
}
