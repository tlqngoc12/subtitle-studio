package com.subtitlestudio.publish;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

/**
 * The public frontend build (packaged in the jar under {@code public-site/}, entry {@code public.html}) plus the
 * Cloudflare Pages files: {@code _redirects} for the SPA (and {@code /} to the Vietsub list), {@code _headers} for caching and robots, {@code robots.txt}.
 */
@Component
public class PublicSiteBundle {

    private static final String ROOT = "public-site/";
    private static final String ENTRY = "public.html";
    private static final String NOINDEX_META = "<meta name=\"robots\" content=\"noindex, nofollow\">";
    private static final String LONG_CACHE = "  Cache-Control: public, max-age=31536000, immutable\n";

    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();

    public void writeTo(Path dir, boolean indexable, String siteUrl) {
        try {
            copyBuild(dir);
            Path index = dir.resolve("index.html");
            if (!indexable) {
                String html = Files.readString(index, StandardCharsets.UTF_8);
                Files.writeString(index, html.replaceFirst("<head>", "<head>" + NOINDEX_META), StandardCharsets.UTF_8);
            }
            Files.writeString(dir.resolve("_redirects"), "/ /vietsub/list 301\n/* /index.html 200\n", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("_headers"), headers(indexable), StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("robots.txt"), robots(indexable, siteUrl), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not prepare the public site", e);
        }
    }

    private static String robots(boolean indexable, String siteUrl) {
        if (!indexable) {
            return "User-agent: *\nDisallow: /\n";
        }
        return "User-agent: *\nAllow: /\nDisallow: /novels/shelf\nDisallow: /data/\nSitemap: " + siteUrl
                + "/sitemap.xml\n";
    }

    private void copyBuild(Path dir) throws IOException {
        if (!resolver.getResource("classpath:" + ROOT + ENTRY).exists()) {
            throw new IllegalStateException("The public site build is missing from the app (classpath:public-site/public.html)");
        }
        for (Resource resource : resolver.getResources("classpath:" + ROOT + "**")) {
            String uri = resource.getURI().toString();
            String relative = uri.substring(uri.lastIndexOf(ROOT) + ROOT.length());
            if (relative.isEmpty() || relative.endsWith("/") || !resource.isReadable()) {
                continue; // a directory
            }
            Path target = dir.resolve(relative.equals(ENTRY) ? "index.html" : relative).normalize();
            if (!target.startsWith(dir)) {
                continue;
            }
            Files.createDirectories(target.getParent());
            try (InputStream in = resource.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
        }
    }

    /**
     * What the public pages may load. Own files only, plus: YouTube thumbnails (img), the YouTube player (its
     * iframe_api script and the nocookie iframe on the Vietsub watch page and a novel's Trailer tab) and Spotify
     * embeds in Profile blocks. Inline styles are allowed because the app sets style attributes.
     */
    private static final String CSP = String.join("; ",
            "default-src 'self'",
            "img-src 'self' data: https://i.ytimg.com",
            "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://open.spotify.com",
            "style-src 'self' 'unsafe-inline'",
            "script-src 'self' https://www.youtube.com",
            "connect-src 'self'",
            "font-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'none'");

    private static String headers(boolean indexable) {
        StringBuilder sb = new StringBuilder();
        // Cloudflare Pages reads one "/*" block, so the noindex header shares it with the security headers.
        sb.append("/*\n");
        if (!indexable) {
            sb.append("  X-Robots-Tag: noindex, nofollow\n");
        }
        sb.append("  X-Content-Type-Options: nosniff\n");
        sb.append("  Referrer-Policy: strict-origin-when-cross-origin\n");
        sb.append("  Content-Security-Policy: ").append(CSP).append("\n\n");
        sb.append("/assets/*\n").append(LONG_CACHE).append('\n');
        sb.append("/media/*\n").append(LONG_CACHE).append('\n');
        // Chapter images are named by a hash of their content, and live apart from the HTML pages under /novels/.
        sb.append("/novel-images/*\n").append(LONG_CACHE).append('\n');
        // The shelf lives in the visitor's browser: keep it out of search results even on an indexable site.
        if (indexable) {
            sb.append("/novels/shelf\n  X-Robots-Tag: noindex\n\n");
        }
        // Data changes on every publish: guests must see it right away.
        sb.append("/data/*\n  Cache-Control: no-cache\n");
        return sb.toString();
    }
}
