package com.subtitlestudio.fanfic;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Reads the story id out of a pasted Wattpad link; the only place that knows the link shapes. */
public final class WattpadLink {

    private static final Set<String> HOSTS = Set.of("wattpad.com", "www.wattpad.com", "m.wattpad.com");
    private static final Pattern STORY_PATH = Pattern.compile("^/story/(\\d{1,19})(?:-[^/]*)?/?$");
    private static final Pattern CHAPTER_PATH = Pattern.compile("^/(\\d{1,19})(?:-[^/]*)?/?$");

    private WattpadLink() {
    }

    /** The story id of a {@code wattpad.com/story/{id}[-slug]} link, empty for anything else. */
    public static Optional<String> storyId(String url) {
        return path(url).map(STORY_PATH::matcher).filter(Matcher::matches).map(m -> m.group(1));
    }

    /** True for a chapter link ({@code wattpad.com/{id}-slug}), which has no story id in it. */
    public static boolean isChapterLink(String url) {
        return path(url).map(CHAPTER_PATH::matcher).filter(Matcher::matches).isPresent();
    }

    public static String canonicalUrl(String storyId) {
        return "https://www.wattpad.com/story/" + storyId;
    }

    private static Optional<String> path(String url) {
        if (url == null || url.isBlank()) {
            return Optional.empty();
        }
        try {
            URI uri = new URI(url.strip());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (!(scheme.equals("http") || scheme.equals("https")) || !HOSTS.contains(host) || uri.getPath() == null) {
                return Optional.empty();
            }
            return Optional.of(uri.getPath());
        } catch (URISyntaxException e) {
            return Optional.empty();
        }
    }
}
