package com.subtitlestudio.profile;

import com.subtitlestudio.url.InvalidUrlException;
import com.subtitlestudio.url.UrlParser;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Turns a YouTube or Spotify link into the URL to put in an iframe. Only these two players are ever embedded,
 * so the frontend never frames an arbitrary URL. Already-normalised embed URLs map to themselves.
 */
@Component
public class EmbedUrlResolver {

    private static final String YOUTUBE_EMBED_HOST = "www.youtube-nocookie.com";
    private static final Pattern YOUTUBE_EMBED_PATH = Pattern.compile("^/embed/([A-Za-z0-9_-]{11})$");
    private static final String SPOTIFY_HOST = "open.spotify.com";
    private static final Pattern SPOTIFY_PATH = Pattern.compile(
            "^/(?:intl-[a-z]{2}(?:-[a-z]{2})?/)?(?:embed/)?(track|album|playlist|artist)/([A-Za-z0-9]{22})/?$");

    private final UrlParser urlParser;

    public EmbedUrlResolver(UrlParser urlParser) {
        this.urlParser = urlParser;
    }

    public Optional<String> resolve(String url) {
        if (url == null || url.isBlank()) {
            return Optional.empty();
        }
        String trimmed = url.strip();
        URI uri;
        try {
            uri = new URI(trimmed);
        } catch (URISyntaxException e) {
            return Optional.empty();
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        String path = uri.getPath() == null ? "" : uri.getPath();
        boolean web = scheme.equals("https") || scheme.equals("http");

        if (web && host.equals(SPOTIFY_HOST)) {
            Matcher m = SPOTIFY_PATH.matcher(path);
            return m.matches()
                    ? Optional.of("https://" + SPOTIFY_HOST + "/embed/" + m.group(1) + "/" + m.group(2))
                    : Optional.empty();
        }
        if (web && host.equals(YOUTUBE_EMBED_HOST)) {
            Matcher m = YOUTUBE_EMBED_PATH.matcher(path);
            return m.matches() ? Optional.of(youtube(m.group(1))) : Optional.empty();
        }
        if (!web) {
            return Optional.empty();
        }
        try {
            return Optional.of(youtube(urlParser.parse(trimmed)));
        } catch (InvalidUrlException e) {
            return Optional.empty();
        }
    }

    private static String youtube(String videoId) {
        return "https://" + YOUTUBE_EMBED_HOST + "/embed/" + videoId;
    }
}
