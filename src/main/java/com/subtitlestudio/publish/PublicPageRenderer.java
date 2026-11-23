package com.subtitlestudio.publish;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * Writes one HTML file per public route (title, description, canonical, Open Graph, plain links) so search engines and
 * link previews see them without running JavaScript. Reads back the JSON that {@link SiteExporter} just wrote, so only
 * data already on the public allowlist is used, and an item that is not exported gets no page. Never chapter text.
 */
@Component
public class PublicPageRenderer {

    /** The site name shown after the page title. */
    public static final String SITE_NAME = "byZenQN";

    private static final int DESCRIPTION_LIMIT = 160;
    private static final Pattern TITLE_TAG = Pattern.compile("(?is)<title>.*?</title>");
    private static final Pattern DESCRIPTION_TAG = Pattern.compile("(?is)<meta\\s+name=\"description\"[^>]*>");
    private static final Pattern HEAD_TAG = Pattern.compile("(?i)<head[^>]*>");
    private static final String ROOT_DIV = "<div id=\"root\"></div>";

    private final ObjectMapper mapper;

    public PublicPageRenderer(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** The pages of the exported site in {@code dir}. */
    public List<PublicPage> pages(Path dir) {
        List<PublicPage> pages = new ArrayList<>();
        videoPages(dir, pages);
        pages.add(new PublicPage("/profiles", "Profile", "Giới thiệu EmiBonnie.", null, "website", null, List.of()));
        pages.add(new PublicPage("/photos", "Photos", "Ảnh của EmiBonnie.", null, "website", null, List.of()));
        workPages(dir, pages);
        novelPages(dir, pages);
        return pages;
    }

    /**
     * Writes {@code <path>.html} for every page, adds the Google verification tag (when set) to {@code index.html}, and
     * returns the pages.
     */
    public List<PublicPage> writeTo(Path dir, String siteUrl, String googleVerification) {
        Path index = dir.resolve("index.html");
        try {
            String template = Files.readString(index, StandardCharsets.UTF_8);
            if (!template.contains(ROOT_DIV) || !HEAD_TAG.matcher(template).find()) {
                throw new IllegalStateException("index.html has no <head> or no " + ROOT_DIV + " to fill");
            }
            List<PublicPage> pages = pages(dir);
            for (PublicPage page : pages) {
                Path target = dir.resolve(page.path().substring(1) + ".html").normalize();
                if (!target.startsWith(dir)) {
                    throw new IllegalStateException("Page path leaves the site folder: " + page.path());
                }
                Files.createDirectories(target.getParent());
                Files.writeString(target, render(template, page, siteUrl, googleVerification), StandardCharsets.UTF_8);
            }
            if (notBlank(googleVerification)) {
                Files.writeString(index, insertAfterHead(template, verificationTag(googleVerification)),
                        StandardCharsets.UTF_8);
            }
            return pages;
        } catch (IOException e) {
            throw new UncheckedIOException("Could not write the public pages", e);
        }
    }

    // ---- pages ----

    private void videoPages(Path dir, List<PublicPage> pages) {
        List<PublicPage.Link> links = new ArrayList<>();
        List<PublicPage> details = new ArrayList<>();
        for (JsonNode v : readArray(dir.resolve("data/videos.json"))) {
            String id = text(v, "id");
            String title = text(v, "title");
            if (id == null || title == null) {
                continue;
            }
            links.add(new PublicPage.Link("/vietsub/" + id, title));
            details.add(new PublicPage("/vietsub/" + id, title + " · Vietsub",
                    "Xem " + title + " kèm phụ đề tiếng Việt.", text(v, "thumbnailUrl"), "video.other",
                    instant(v.get("viUpdatedAt")), List.of(new PublicPage.Link("/vietsub/list", "Vietsub"))));
        }
        pages.add(new PublicPage("/vietsub/list", "Vietsub", "Video thần tượng Thái Lan kèm phụ đề tiếng Việt.", null,
                "website", null, links));
        pages.addAll(details);
    }

    private void workPages(Path dir, List<PublicPage> pages) {
        List<PublicPage.Link> links = new ArrayList<>();
        List<PublicPage> details = new ArrayList<>();
        for (JsonNode w : readArray(dir.resolve("data/works.json"))) {
            JsonNode idNode = w.get("id");
            String title = text(w, "title");
            if (idNode == null || title == null) {
                continue;
            }
            String id = idNode.asText();
            links.add(new PublicPage.Link("/works/" + id, title));
            JsonNode detail = readTree(dir.resolve("data/works/" + id + ".json"));
            String description = detail == null ? null : text(detail, "description");
            details.add(new PublicPage("/works/" + id, title,
                    description != null ? description : title + " — tác phẩm của EmiBonnie.",
                    text(w, "coverUrl"), "website", null, List.of(new PublicPage.Link("/works", "Works"))));
        }
        pages.add(new PublicPage("/works", "Works", "Phim, nhạc và chương trình của EmiBonnie.", null, "website", null,
                links));
        pages.addAll(details);
    }

    private void novelPages(Path dir, List<PublicPage> pages) {
        List<PublicPage.Link> links = new ArrayList<>();
        List<PublicPage> details = new ArrayList<>();
        for (JsonNode s : readArray(dir.resolve("data/novels.json"))) {
            String slug = text(s, "slug");
            String title = text(s, "title");
            JsonNode detail = slug == null ? null : readTree(dir.resolve("data/novels/" + slug + ".json"));
            if (detail == null || title == null) {
                continue;
            }
            links.add(new PublicPage.Link("/novels/" + slug, title));
            String description = text(s, "description");
            String cover = text(s, "coverUrl");
            List<JsonNode> chapters = new ArrayList<>();
            detail.path("chapters").forEach(c -> {
                if (c.has("chapterNo")) {
                    chapters.add(c);
                }
            });
            List<PublicPage.Link> chapterLinks = new ArrayList<>();
            List<PublicPage> chapterPages = new ArrayList<>();
            for (int i = 0; i < chapters.size(); i++) {
                JsonNode c = chapters.get(i);
                String name = chapterName(c);
                PublicPage.Link self = chapterLink(slug, c);
                chapterLinks.add(self);
                List<PublicPage.Link> around = new ArrayList<>();
                around.add(new PublicPage.Link("/novels/" + slug, title));
                if (i > 0) {
                    around.add(chapterLink(slug, chapters.get(i - 1)));
                }
                if (i + 1 < chapters.size()) {
                    around.add(chapterLink(slug, chapters.get(i + 1)));
                }
                chapterPages.add(new PublicPage(self.href(), name + " · " + title,
                        "Đọc " + name + " của " + title + ".", cover, "book", instant(c.get("publishedAt")), around));
            }
            details.add(new PublicPage("/novels/" + slug, title,
                    description != null ? description : "Đọc " + title + " bằng tiếng Việt.", cover, "book",
                    instant(s.get("lastPublishedAt")), chapterLinks));
            details.addAll(chapterPages);
        }
        pages.add(new PublicPage("/novels", "Truyện", "Truyện dịch và sáng tác tiếng Việt.", null, "website", null,
                links));
        pages.addAll(details);
    }

    private static PublicPage.Link chapterLink(String slug, JsonNode chapter) {
        return new PublicPage.Link("/novels/" + slug + "/" + chapter.get("chapterNo").asInt(), chapterName(chapter));
    }

    private static String chapterName(JsonNode chapter) {
        String label = text(chapter, "label");
        return label != null ? label : "Chương " + chapter.path("chapterNo").asInt();
    }

    // ---- HTML ----

    private static String render(String template, PublicPage page, String siteUrl, String googleVerification) {
        String url = siteUrl + page.path();
        String fullTitle = page.title() + " · " + SITE_NAME;
        String description = shorten(page.description());
        String image = page.imageUrl() == null || page.imageUrl().isBlank() ? siteUrl + "/logo.webp"
                : page.imageUrl().startsWith("/") ? siteUrl + page.imageUrl() : page.imageUrl();

        StringBuilder head = new StringBuilder();
        head.append("<title>").append(esc(fullTitle)).append("</title>");
        head.append(meta("name", "description", description));
        head.append("<link rel=\"canonical\" href=\"").append(esc(url)).append("\">");
        head.append(meta("property", "og:title", fullTitle));
        head.append(meta("property", "og:description", description));
        head.append(meta("property", "og:url", url));
        head.append(meta("property", "og:image", image));
        head.append(meta("property", "og:type", page.ogType()));
        head.append(meta("property", "og:site_name", SITE_NAME));
        head.append(meta("name", "twitter:card", "summary_large_image"));
        if (notBlank(googleVerification)) {
            head.append(verificationTag(googleVerification));
        }

        StringBuilder body = new StringBuilder("<div id=\"root\"><main><h1>").append(esc(page.title()))
                .append("</h1><p>").append(esc(description)).append("</p>");
        if (!page.links().isEmpty()) {
            body.append("<ul>");
            for (PublicPage.Link link : page.links()) {
                body.append("<li><a href=\"").append(esc(link.href())).append("\">").append(esc(link.text()))
                        .append("</a></li>");
            }
            body.append("</ul>");
        }
        body.append("</main></div>");

        String html = TITLE_TAG.matcher(template).replaceFirst("");
        html = DESCRIPTION_TAG.matcher(html).replaceFirst("");
        html = insertAfterHead(html, head.toString());
        return html.replace(ROOT_DIV, body); // String.replace is literal: no $ or \ surprises from titles
    }

    private static String insertAfterHead(String html, String tags) {
        Matcher m = HEAD_TAG.matcher(html);
        if (!m.find()) {
            throw new IllegalStateException("index.html has no <head>");
        }
        return html.substring(0, m.end()) + tags + html.substring(m.end());
    }

    private static String verificationTag(String code) {
        return meta("name", "google-site-verification", code.trim());
    }

    private static String meta(String attr, String name, String content) {
        return "<meta " + attr + "=\"" + name + "\" content=\"" + esc(content) + "\">";
    }

    /** Collapses whitespace and cuts to 160 code points (never inside an emoji), ending with an ellipsis. */
    static String shorten(String text) {
        String flat = text == null ? "" : text.replaceAll("\\s+", " ").trim();
        if (flat.codePointCount(0, flat.length()) <= DESCRIPTION_LIMIT) {
            return flat;
        }
        int end = flat.offsetByCodePoints(0, DESCRIPTION_LIMIT - 1);
        return flat.substring(0, end) + "…";
    }

    private static String esc(String value) {
        return HtmlUtils.htmlEscape(value, "UTF-8");
    }

    // ---- JSON ----

    private JsonNode readTree(Path file) {
        if (!Files.isRegularFile(file)) {
            return null;
        }
        try {
            return mapper.readTree(file.toFile());
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + file.getFileName(), e);
        }
    }

    private List<JsonNode> readArray(Path file) {
        JsonNode root = readTree(file);
        List<JsonNode> items = new ArrayList<>();
        if (root != null && root.isArray()) {
            root.forEach(items::add);
        }
        return items;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() || v.asText().isBlank() ? null : v.asText();
    }

    private static Instant instant(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        try {
            if (node.isNumber()) {
                return Instant.ofEpochMilli(Math.round(node.asDouble() * 1000));
            }
            return Instant.parse(node.asText());
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
