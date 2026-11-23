package com.subtitlestudio.publish;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * Writes {@code sitemap.xml} for the public pages. Over {@code maxUrlsPerFile} pages it writes
 * {@code sitemap-1.xml}, {@code sitemap-2.xml}… and makes {@code sitemap.xml} a sitemap index of them.
 */
@Component
public class SitemapWriter {

    /** The sitemap protocol allows 50,000 URLs per file. */
    static final int MAX_URLS = 50_000;

    private static final String XML = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
    private static final String NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

    private final int maxUrlsPerFile;

    @Autowired
    public SitemapWriter() {
        this(MAX_URLS);
    }

    SitemapWriter(int maxUrlsPerFile) {
        this.maxUrlsPerFile = maxUrlsPerFile;
    }

    public void write(Path dir, String siteUrl, List<PublicPage> pages) {
        try {
            if (pages.size() <= maxUrlsPerFile) {
                Files.writeString(dir.resolve("sitemap.xml"), urlset(siteUrl, pages), StandardCharsets.UTF_8);
                return;
            }
            List<String> names = new ArrayList<>();
            for (int from = 0, n = 1; from < pages.size(); from += maxUrlsPerFile, n++) {
                String name = "sitemap-" + n + ".xml";
                names.add(name);
                List<PublicPage> part = pages.subList(from, Math.min(pages.size(), from + maxUrlsPerFile));
                Files.writeString(dir.resolve(name), urlset(siteUrl, part), StandardCharsets.UTF_8);
            }
            StringBuilder index = new StringBuilder(XML).append("<sitemapindex xmlns=\"").append(NS).append("\">\n");
            for (String name : names) {
                index.append("<sitemap><loc>").append(esc(siteUrl + "/" + name)).append("</loc></sitemap>\n");
            }
            index.append("</sitemapindex>\n");
            Files.writeString(dir.resolve("sitemap.xml"), index.toString(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not write the sitemap", e);
        }
    }

    private static String urlset(String siteUrl, List<PublicPage> pages) {
        StringBuilder xml = new StringBuilder(XML).append("<urlset xmlns=\"").append(NS).append("\">\n");
        for (PublicPage page : pages) {
            xml.append("<url><loc>").append(esc(siteUrl + page.path())).append("</loc>");
            if (page.lastModified() != null) {
                xml.append("<lastmod>").append(page.lastModified().atZone(ZoneOffset.UTC).toLocalDate())
                        .append("</lastmod>");
            }
            xml.append("</url>\n");
        }
        return xml.append("</urlset>\n").toString();
    }

    private static String esc(String value) {
        return HtmlUtils.htmlEscape(value, "UTF-8");
    }
}
