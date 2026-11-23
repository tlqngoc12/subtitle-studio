package com.subtitlestudio.publish;

import java.time.Instant;
import java.util.List;

/**
 * One public URL that gets its own pre-rendered HTML file (and a sitemap entry).
 *
 * @param path         starts with {@code /}, for example {@code /novels/be-my-sugar/3}
 * @param title        the page title without the site name suffix; also the {@code <h1>}
 * @param imageUrl     absolute or site-relative; null falls back to the site logo
 * @param ogType       the {@code og:type} value ({@code website}, {@code book}, {@code video.other})
 * @param lastModified null when unknown
 * @param links        plain links shown inside {@code #root} so crawlers can follow them without running JS
 */
public record PublicPage(String path, String title, String description, String imageUrl, String ogType,
                         Instant lastModified, List<Link> links) {

    public record Link(String href, String text) {}
}
