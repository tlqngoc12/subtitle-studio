package com.subtitlestudio.photo;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/** Finds the numeric status id in an X / Twitter post link (x.com, twitter.com, mobile., fxtwitter, vxtwitter). */
public final class XStatusUrl {

    private static final Set<String> HOSTS = Set.of("x.com", "www.x.com", "mobile.x.com", "twitter.com",
            "www.twitter.com", "mobile.twitter.com", "fxtwitter.com", "www.fxtwitter.com", "vxtwitter.com",
            "www.vxtwitter.com", "fixupx.com", "www.fixupx.com");
    private static final Pattern ID = Pattern.compile("[0-9]{1,25}");

    private XStatusUrl() {
    }

    public static Optional<String> statusId(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        String text = raw.strip();
        if (!text.contains("://")) {
            text = "https://" + text;
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
        String[] parts = Arrays.stream((uri.getPath() == null ? "" : uri.getPath()).split("/"))
                .filter(s -> !s.isEmpty()).toArray(String[]::new);
        for (int i = 0; i + 1 < parts.length; i++) {
            if (parts[i].equals("status") && ID.matcher(parts[i + 1]).matches()) {
                return Optional.of(parts[i + 1]);
            }
        }
        return Optional.empty();
    }
}
