package com.subtitlestudio.fanfic;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Reads one story from Wattpad's public API. Called only when the admin adds or refreshes a story, never on a
 * schedule or a page view. Every failure that is not "story not found" becomes {@link WattpadUnavailableException}
 * so a blocked or changed API never leaves a half-saved story.
 */
@Component
public class WattpadClient {

    static final String USER_AGENT = "SubtitleStudio";
    private static final String FIELDS = "id,title,url,cover,description,readCount,voteCount,numParts,completed,tags,"
            + "user(username),modifyDate,lastPublishedPart(createDate),parts(wordCount)";

    private final String baseUrl;
    private final Duration timeout;
    private final ObjectMapper mapper;
    private final HttpClient http;

    @Autowired
    public WattpadClient(@Value("${subtitlestudio.wattpad.base-url:https://www.wattpad.com}") String baseUrl,
                         ObjectMapper mapper) {
        this(baseUrl, Duration.ofSeconds(10), mapper);
    }

    WattpadClient(String baseUrl, Duration timeout, ObjectMapper mapper) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.timeout = timeout;
        this.mapper = mapper;
        this.http = HttpClient.newBuilder().connectTimeout(timeout).followRedirects(HttpClient.Redirect.NORMAL).build();
    }

    public WattpadStory fetch(String storyId) {
        if (storyId == null || !storyId.matches("\\d{1,19}")) {
            throw new IllegalArgumentException("Not a Wattpad story id");
        }
        HttpResponse<byte[]> response = get(URI.create(baseUrl + "/api/v3/stories/" + storyId + "?fields=" + FIELDS));
        int code = response.statusCode();
        if (code == 404 || code == 400) {
            throw new FanficNotFoundException();
        }
        if (code != 200) {
            throw new WattpadUnavailableException("Wattpad answered " + code);
        }
        JsonNode root;
        try {
            root = mapper.readTree(response.body());
        } catch (IOException e) {
            throw new WattpadUnavailableException("Wattpad did not answer with JSON", e);
        }
        if (root == null || !root.isObject() || text(root, "title") == null) {
            throw new WattpadUnavailableException("Wattpad answer has no story");
        }
        return toStory(storyId, root);
    }

    /** Downloads the cover, trying the larger {@code -512-} variant first and falling back to the given URL. */
    public byte[] downloadCover(String coverUrl) {
        String larger = coverUrl.replace("-256-", "-512-");
        if (!larger.equals(coverUrl)) {
            HttpResponse<byte[]> big = get(URI.create(larger));
            if (big.statusCode() == 200 && big.body().length > 0) {
                return big.body();
            }
        }
        HttpResponse<byte[]> original = get(URI.create(coverUrl));
        if (original.statusCode() != 200 || original.body().length == 0) {
            throw new WattpadUnavailableException("Wattpad cover answered " + original.statusCode());
        }
        return original.body();
    }

    private HttpResponse<byte[]> get(URI uri) {
        HttpRequest request = HttpRequest.newBuilder(uri).timeout(timeout).header("User-Agent", USER_AGENT)
                .header("Accept", "application/json, image/*").GET().build();
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException e) {
            throw new WattpadUnavailableException("Could not reach Wattpad", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WattpadUnavailableException("Interrupted while waiting for Wattpad", e);
        }
    }

    private static WattpadStory toStory(String requestedId, JsonNode n) {
        String id = text(n, "id") == null ? requestedId : text(n, "id");
        List<String> tags = new ArrayList<>();
        for (JsonNode t : n.path("tags")) {
            if (t.isTextual() && !t.asText().isBlank()) {
                tags.add(t.asText().strip());
            }
        }
        long words = 0;
        for (JsonNode p : n.path("parts")) {
            words += Math.max(0, p.path("wordCount").asLong(0));
        }
        Instant updated = instant(n.path("lastPublishedPart").path("createDate"));
        if (updated == null) {
            updated = instant(n.path("modifyDate"));
        }
        return new WattpadStory(id, text(n, "title"), text(n.path("user"), "username"), text(n, "description"), tags,
                text(n, "cover"), n.path("readCount").asLong(0), n.path("voteCount").asLong(0),
                n.path("numParts").asInt(0), words, n.path("completed").asBoolean(false), updated);
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || !v.isTextual() || v.asText().isBlank() ? null : v.asText().strip();
    }

    private static Instant instant(JsonNode v) {
        if (v == null || !v.isTextual()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(v.asText()).toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
