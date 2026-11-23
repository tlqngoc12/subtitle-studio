package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SitemapWriterTest {

    private static final String SITE = "https://abc.pages.dev";

    @TempDir
    Path dir;

    private static PublicPage page(String path, Instant modified) {
        return new PublicPage(path, "T", "D", null, "website", modified, List.of());
    }

    private String read(String name) throws IOException {
        return Files.readString(dir.resolve(name), StandardCharsets.UTF_8);
    }

    @Test
    void writesUrlset() throws IOException {
        new SitemapWriter(50_000).write(dir, SITE, List.of(page("/novels", null),
                page("/novels/sugar", Instant.parse("2026-11-20T23:30:00Z")), page("/profiles", null)));

        String xml = read("sitemap.xml");
        assertThat(xml).startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>").contains("<urlset");
        assertThat(xml.split("<loc>", -1)).hasSize(4);
        assertThat(xml).contains("<loc>https://abc.pages.dev/novels</loc>")
                .contains("<loc>https://abc.pages.dev/novels/sugar</loc><lastmod>2026-11-20</lastmod>")
                .contains("<loc>https://abc.pages.dev/profiles</loc></url>");
        assertThat(xml.split("<lastmod>", -1)).hasSize(2);
    }

    @Test
    void escapesAmpersand() throws IOException {
        new SitemapWriter(50_000).write(dir, SITE, List.of(page("/works/a&b", null)));

        assertThat(read("sitemap.xml")).contains("<loc>https://abc.pages.dev/works/a&amp;b</loc>")
                .doesNotContain("a&b");
    }

    @Test
    void splitsIntoIndex() throws IOException {
        List<PublicPage> pages = new ArrayList<>();
        for (int i = 1; i <= 5; i++) {
            pages.add(page("/p" + i, null));
        }

        new SitemapWriter(2).write(dir, SITE, pages);

        assertThat(dir.resolve("sitemap-1.xml")).exists();
        assertThat(dir.resolve("sitemap-2.xml")).exists();
        assertThat(dir.resolve("sitemap-3.xml")).exists();
        assertThat(dir.resolve("sitemap-4.xml")).doesNotExist();
        String index = read("sitemap.xml");
        assertThat(index).contains("<sitemapindex").doesNotContain("<urlset");
        assertThat(index.split("<loc>", -1)).hasSize(4);
        assertThat(index).contains("<loc>https://abc.pages.dev/sitemap-3.xml</loc>");
        assertThat(read("sitemap-3.xml")).contains("/p5").doesNotContain("/p4");
    }
}
