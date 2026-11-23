package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PublicPageRendererTest {

    private static final String SITE = "https://abc.pages.dev";
    private static final String TEMPLATE = "<!doctype html><html lang=\"vi\"><head><meta charset=\"UTF-8\" />"
            + "<meta name=\"description\" content=\"Old description\" /><link rel=\"icon\" href=\"/logo.webp\" />"
            + "<title>byZenQN</title></head><body><div id=\"root\"></div><script src=\"/assets/app.js\"></script></body></html>";

    private final PublicPageRenderer renderer = new PublicPageRenderer(new ObjectMapper());

    @TempDir
    Path dir;

    @BeforeEach
    void site() throws IOException {
        write("index.html", TEMPLATE);
        write("data/videos.json", "[{\"id\":\"v1\",\"title\":\"Ep 1\",\"thumbnailUrl\":\"https://i.ytimg.com/vi/v1/hq.jpg\","
                + "\"viUpdatedAt\":\"2026-11-20T08:00:00Z\"}]");
        write("data/works.json", "[{\"id\":7,\"title\":\"Some Drama\",\"coverUrl\":\"/media/w.webp\"}]");
        write("data/works/7.json", "{\"id\":7,\"title\":\"Some Drama\",\"description\":\"A drama.\"}");
        write("data/novels.json", "[{\"slug\":\"sugar\",\"title\":\"Be My Sugar\",\"coverUrl\":\"/media/c.webp\","
                + "\"description\":\"Sweet story\",\"lastPublishedAt\":\"2026-11-21T01:00:00Z\"}]");
        write("data/novels/sugar.json", "{\"slug\":\"sugar\",\"title\":\"Be My Sugar\",\"chapters\":["
                + "{\"chapterNo\":3,\"title\":\"x\",\"label\":null,\"publishedAt\":\"2026-11-19T01:00:00Z\"},"
                + "{\"chapterNo\":4,\"title\":\"y\",\"label\":\"Ngoại truyện 1\",\"publishedAt\":null}]}");
        write("data/novels/sugar/3.json", "{\"chapterNo\":3,\"prev\":null,\"next\":4,"
                + "\"images\":[\"/novel-images/sugar/a-1.webp\"],\"formats\":[]}");
    }

    private void write(String path, String content) throws IOException {
        Path file = dir.resolve(path);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content, StandardCharsets.UTF_8);
    }

    private String read(String path) throws IOException {
        return Files.readString(dir.resolve(path), StandardCharsets.UTF_8);
    }

    private static int count(String haystack, String needle) {
        return haystack.split(java.util.regex.Pattern.quote(needle), -1).length - 1;
    }

    @Test
    void writesOneFilePerRoute() {
        renderer.writeTo(dir, SITE, "");

        for (String f : List.of("vietsub/list.html", "vietsub/v1.html", "novels.html", "novels/sugar.html",
                "novels/sugar/3.html", "novels/sugar/4.html", "works/7.html", "profiles.html", "photos.html",
                "works.html")) {
            assertThat(dir.resolve(f)).as(f).exists();
        }
    }

    @Test
    void novelPageHasHeadTags() throws IOException {
        renderer.writeTo(dir, SITE, "");

        String html = read("novels/sugar.html");
        assertThat(html).contains("<title>Be My Sugar · byZenQN</title>")
                .contains("<link rel=\"canonical\" href=\"https://abc.pages.dev/novels/sugar\">")
                .contains("<meta property=\"og:type\" content=\"book\">")
                .contains("<meta property=\"og:image\" content=\"https://abc.pages.dev/media/c.webp\">")
                .contains("<meta property=\"og:site_name\" content=\"byZenQN\">")
                .contains("<meta name=\"twitter:card\" content=\"summary_large_image\">")
                .contains("<meta name=\"description\" content=\"Sweet story\">")
                .contains("<script src=\"/assets/app.js\"></script>");
        assertThat(count(html, "<title>")).isEqualTo(1);
        assertThat(count(html, "name=\"description\"")).isEqualTo(1);
        assertThat(html).doesNotContain("Old description");
    }

    @Test
    void videoPageUsesThumbnailAndVideoType() throws IOException {
        renderer.writeTo(dir, SITE, "");

        assertThat(read("vietsub/v1.html")).contains("<title>Ep 1 · Vietsub · byZenQN</title>")
                .contains("content=\"https://i.ytimg.com/vi/v1/hq.jpg\"").contains("content=\"video.other\"");
    }

    @Test
    void novelPageLinksChapters() throws IOException {
        renderer.writeTo(dir, SITE, "");

        String html = read("novels/sugar.html");
        assertThat(html).contains("<div id=\"root\"><main><h1>Be My Sugar</h1>")
                .contains("<a href=\"/novels/sugar/3\">Chương 3</a>")
                .contains("<a href=\"/novels/sugar/4\">Ngoại truyện 1</a>");
        assertThat(read("novels/sugar/3.html")).contains("<title>Chương 3 · Be My Sugar · byZenQN</title>")
                .contains("<a href=\"/novels/sugar\">Be My Sugar</a>")
                .contains("<a href=\"/novels/sugar/4\">Ngoại truyện 1</a>");
    }

    @Test
    void pagesCarryTheirLastModifiedDate() {
        List<PublicPage> pages = renderer.writeTo(dir, SITE, "");

        assertThat(pages).filteredOn(p -> p.path().equals("/novels/sugar")).singleElement()
                .satisfies(p -> assertThat(p.lastModified()).hasToString("2026-11-21T01:00:00Z"));
        assertThat(pages).filteredOn(p -> p.path().equals("/novels/sugar/4")).singleElement()
                .satisfies(p -> assertThat(p.lastModified()).isNull());
        assertThat(pages).filteredOn(p -> p.path().equals("/vietsub/v1")).singleElement()
                .satisfies(p -> assertThat(p.lastModified()).hasToString("2026-11-20T08:00:00Z"));
    }

    @Test
    void escapesTitles() throws IOException {
        write("data/novels.json", "[{\"slug\":\"sugar\",\"title\":\"A<b> & \\\"C\\\" $1 \\\\ 😀\"}]");

        renderer.writeTo(dir, SITE, "");

        String html = read("novels/sugar.html");
        assertThat(html).contains("A&lt;b&gt; &amp; &quot;C&quot; $1 \\ 😀").doesNotContain("<b>");
    }

    @Test
    void truncatesDescription() throws IOException {
        String emojis = "😀".repeat(300);
        write("data/novels.json", "[{\"slug\":\"sugar\",\"title\":\"T\",\"description\":\"line one\\n\\n   two "
                + emojis + "\"}]");

        renderer.writeTo(dir, SITE, "");

        String html = read("novels/sugar.html");
        String description = html.replaceAll("(?s).*<meta name=\"description\" content=\"([^\"]*)\">.*", "$1");
        assertThat(description).doesNotContain("\n").startsWith("line one two ").endsWith("…");
        assertThat(description.codePointCount(0, description.length())).isEqualTo(160);
        assertThat(PublicPageRenderer.shorten("short  text\n")).isEqualTo("short text");
    }

    @Test
    void usesDefaultDescriptionWhenEmpty() throws IOException {
        write("data/novels.json", "[{\"slug\":\"sugar\",\"title\":\"Be My Sugar\",\"description\":\"  \"}]");

        renderer.writeTo(dir, SITE, "");

        assertThat(read("novels/sugar.html")).contains("content=\"Đọc Be My Sugar bằng tiếng Việt.\"");
    }

    @Test
    void fallsBackToLogo() throws IOException {
        write("data/novels.json", "[{\"slug\":\"sugar\",\"title\":\"Be My Sugar\",\"coverUrl\":null}]");

        renderer.writeTo(dir, SITE, "");

        assertThat(read("novels/sugar.html")).contains("<meta property=\"og:image\" content=\"https://abc.pages.dev/logo.webp\">");
        assertThat(read("profiles.html")).contains("content=\"https://abc.pages.dev/logo.webp\"");
    }

    @Test
    void verificationMetaOnlyWhenSet() throws IOException {
        renderer.writeTo(dir, SITE, "X");

        String tag = "<meta name=\"google-site-verification\" content=\"X\">";
        assertThat(read("index.html")).contains(tag);
        assertThat(read("novels/sugar.html")).contains(tag);
        assertThat(read("vietsub/list.html")).contains(tag);
    }

    @Test
    void noVerificationMetaWhenBlank() throws IOException {
        renderer.writeTo(dir, SITE, "");

        assertThat(read("index.html")).doesNotContain("google-site-verification");
        try (var files = Files.walk(dir)) {
            for (Path f : files.filter(p -> p.toString().endsWith(".html")).toList()) {
                assertThat(Files.readString(f)).as(f.toString()).doesNotContain("google-site-verification");
            }
        }
    }

    @Test
    void noChapterTextAnywhere() throws IOException {
        renderer.writeTo(dir, SITE, "");

        assertThat(read("novels/sugar/3.html")).doesNotContain("a-1.webp").doesNotContain("novel-images");
    }

    @Test
    void onlyExportedItems() {
        renderer.writeTo(dir, SITE, "");

        assertThat(dir.resolve("novels/hidden.html")).doesNotExist();
        assertThat(dir.resolve("vietsub/other.html")).doesNotExist();
        assertThat(dir.resolve("novels/shelf.html")).doesNotExist();
    }

    @Test
    void failsOnBrokenTemplate() throws IOException {
        write("index.html", "<html><head></head><body></body></html>");

        assertThatThrownBy(() -> renderer.writeTo(dir, SITE, "")).isInstanceOf(IllegalStateException.class);
    }
}
