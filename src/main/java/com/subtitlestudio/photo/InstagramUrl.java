package com.subtitlestudio.photo;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/** Reduces any Instagram share link to {@code https://www.instagram.com/{p|reel|tv}/{code}/}. */
public final class InstagramUrl {

    private static final Set<String> HOSTS = Set.of("instagram.com", "www.instagram.com", "m.instagram.com");
    private static final Set<String> KINDS = Set.of("p", "reel", "tv");
    private static final Pattern CODE = Pattern.compile("[A-Za-z0-9_-]+");

    private InstagramUrl() {
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
        if (!(scheme.equals("http") || scheme.equals("https")) || !HOSTS.contains(host)) {
            return Optional.empty();
        }
        String path = uri.getPath() == null ? "" : uri.getPath();
        String[] parts = java.util.Arrays.stream(path.split("/")).filter(s -> !s.isEmpty()).toArray(String[]::new);
        int at = parts.length == 2 ? 0 : parts.length == 3 ? 1 : -1; // optional /{username} first
        if (at < 0 || !KINDS.contains(parts[at]) || !CODE.matcher(parts[at + 1]).matches()) {
            return Optional.empty();
        }
        return Optional.of("https://www.instagram.com/" + parts[at] + "/" + parts[at + 1] + "/");
    }
}
