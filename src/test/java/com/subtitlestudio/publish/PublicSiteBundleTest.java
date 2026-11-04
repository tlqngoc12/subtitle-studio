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
}
