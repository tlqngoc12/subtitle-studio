package com.subtitlestudio.photo;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Reduces an Instagram or X (Twitter) post link to one canonical form:
 * {@code https://www.instagram.com/{p|reel|tv}/{code}/} or {@code https://x.com/{user}/status/{id}}.
 */
public final class PostUrl {

    private static final Set<String> INSTAGRAM_HOSTS = Set.of("instagram.com", "www.instagram.com", "m.instagram.com");
    private static final Set<String> X_HOSTS = Set.of("x.com", "www.x.com", "twitter.com", "www.twitter.com",
            "mobile.twitter.com", "mobile.x.com", "fxtwitter.com", "www.fxtwitter.com", "vxtwitter.com",
            "www.vxtwitter.com", "fixupx.com", "www.fixupx.com");
    private static final Set<String> KINDS = Set.of("p", "reel", "tv");
    private static final Set<String> X_MEDIA = Set.of("photo", "video");
    private static final Pattern CODE = Pattern.compile("[A-Za-z0-9_-]+");
    private static final Pattern X_USER = Pattern.compile("[A-Za-z0-9_]{1,50}");
    private static final Pattern X_ID = Pattern.compile("[0-9]{1,25}");
    private static final Pattern DIGITS = Pattern.compile("[0-9]+");

    private PostUrl() {
    }

    public static Optional<String> normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        String text = raw.strip();
        if (!text.contains("://")) {
            text = "https://" + text; // "instagram.com/p/x" pasted without the scheme
        }
        URI uri;
        try {
            uri = new URI(text);
        } catch (URISyntaxException e) {
            return Optional.empty();
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (!(scheme.equals("http") || scheme.equals("https"))) {
            return Optional.empty();
        }
        String path = uri.getPath() == null ? "" : uri.getPath();
        String[] parts = Arrays.stream(path.split("/")).filter(s -> !s.isEmpty()).toArray(String[]::new);
        if (INSTAGRAM_HOSTS.contains(host)) {
            return instagram(parts);
        }
        if (X_HOSTS.contains(host)) {
            return x(parts);
        }
        return Optional.empty();
    }

    private static Optional<String> instagram(String[] parts) {
        int at = parts.length == 2 ? 0 : parts.length == 3 ? 1 : -1; // optional /{username} first
        if (at < 0 || !KINDS.contains(parts[at]) || !CODE.matcher(parts[at + 1]).matches()) {
            return Optional.empty();
        }
        return Optional.of("https://www.instagram.com/" + parts[at] + "/" + parts[at + 1] + "/");
    }

    /** {@code /{user}/status/{id}} with an optional {@code /photo/N} or {@code /video/N} tail. */
    private static Optional<String> x(String[] parts) {
        boolean tail = parts.length == 5;
        if (parts.length != 3 && !tail) {
            return Optional.empty();
        }
        if (!X_USER.matcher(parts[0]).matches() || !parts[1].equals("status") || !X_ID.matcher(parts[2]).matches()) {
            return Optional.empty();
        }
        if (tail && !(X_MEDIA.contains(parts[3]) && DIGITS.matcher(parts[4]).matches())) {
            return Optional.empty();
        }
        return Optional.of("https://x.com/" + parts[0] + "/status/" + parts[2]);
    }
}
