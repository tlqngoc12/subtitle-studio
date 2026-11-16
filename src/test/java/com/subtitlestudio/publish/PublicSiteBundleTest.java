package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PublicSiteBundleTest {

    private final PublicSiteBundle bundle = new PublicSiteBundle();

    @TempDir
    Path out;

    private String read(String path) throws IOException {
        return Files.readString(out.resolve(path), StandardCharsets.UTF_8);
    }

    @Test
    void copiesBuildAndRenamesEntryToIndex() throws IOException {
        bundle.writeTo(out, false);

        assertThat(out.resolve("index.html")).exists();
        assertThat(read("assets/app.js")).isEqualTo("console.log(1);");
        assertThat(out.resolve("public.html")).doesNotExist();
    }

    @Test
    void redirectsEverythingToTheSpa() throws IOException {
        bundle.writeTo(out, false);

        assertThat(read("_redirects")).isEqualTo("/* /index.html 200\n");
    }

    @Test
    void headersCacheAssetsButNotData() throws IOException {
        bundle.writeTo(out, true);

        String headers = read("_headers");
        assertThat(headers).contains("/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n");
        assertThat(headers).contains("/media/*\n  Cache-Control: public, max-age=31536000, immutable\n");
        assertThat(headers).contains("/novels/*\n  Cache-Control: public, max-age=31536000, immutable\n");
        assertThat(headers).contains("/data/*\n  Cache-Control: no-cache\n");
    }

    @Test
    void noindexByDefault() throws IOException {
        bundle.writeTo(out, false);

        assertThat(read("index.html")).contains("<head><meta name=\"robots\" content=\"noindex, nofollow\">");
        assertThat(read("_headers")).contains("/*\n  X-Robots-Tag: noindex, nofollow\n");
        assertThat(read("robots.txt")).isEqualTo("User-agent: *\nDisallow: /\n");
    }

    @Test
    void indexableSiteHasNoRobotsBlock() throws IOException {
        bundle.writeTo(out, true);

        assertThat(read("index.html")).doesNotContain("robots");
        assertThat(read("_headers")).doesNotContain("X-Robots-Tag");
        assertThat(read("robots.txt")).isEqualTo("User-agent: *\nAllow: /\n");
    }

    @Test
    void headers_include_csp_and_nosniff_for_all_paths() throws IOException {
        bundle.writeTo(out, true);

        String headers = read("_headers");
        assertThat(headers.split("(?m)^/\\*$", -1)).as("exactly one /* block").hasSize(2);
        assertThat(headers).contains("/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n"
                + "  Content-Security-Policy: default-src 'self'; ");
        String csp = headers.lines().filter(l -> l.startsWith("  Content-Security-Policy:")).findFirst().orElseThrow();
        assertThat(csp).contains("img-src 'self' data: https://i.ytimg.com;")
                .contains("frame-src https://www.youtube-nocookie.com https://www.youtube.com")
                .contains("style-src 'self' 'unsafe-inline';")
                .contains("connect-src 'self';")
                .contains("font-src 'self';")
                .contains("frame-ancestors 'none';")
                .contains("base-uri 'self';")
                .endsWith("form-action 'none'");
    }

    @Test
    void noindex_stays_in_same_block_when_not_indexable() throws IOException {
        bundle.writeTo(out, false);

        String headers = read("_headers");
        assertThat(headers.split("(?m)^/\\*$", -1)).as("exactly one /* block").hasSize(2);
        String block = headers.substring(0, headers.indexOf("\n\n"));
        assertThat(block).startsWith("/*\n  X-Robots-Tag: noindex, nofollow\n")
                .contains("X-Content-Type-Options: nosniff").contains("Content-Security-Policy:");
    }

    @Test
    void indexable_site_has_no_noindex() throws IOException {
        bundle.writeTo(out, true);

        assertThat(read("_headers")).doesNotContain("noindex");
    }
}
