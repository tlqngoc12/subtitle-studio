package com.subtitlestudio.fanfic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Runs against a local stub server; the real Wattpad is never called. */
class WattpadClientTest {

    private HttpServer server;
    private WattpadClient client;
    private final List<String> userAgents = new CopyOnWriteArrayList<>();
    private final List<String> coverRequests = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String body;
    private volatile long delayMs;
    private final List<String> textRequests = new CopyOnWriteArrayList<>();
    private final java.util.Map<String, String> textPages = new java.util.concurrent.ConcurrentHashMap<>();
    private volatile int textStatus = 200;

    @BeforeEach
    void start() throws Exception {
        body = Files.readString(Path.of("src/test/resources/wattpad/story-396487502.json"), StandardCharsets.UTF_8);
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/v3/stories/", ex -> {
            userAgents.add(ex.getRequestHeaders().getFirst("User-Agent"));
            if (delayMs > 0) {
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            respond(ex, status, "application/json", body.getBytes(StandardCharsets.UTF_8));
        });
        server.createContext("/apiv2/storytext", ex -> {
            String query = ex.getRequestURI().getRawQuery();
            textRequests.add(query);
            // Like real Wattpad: no page parameter = the whole part; page=N = that page; past the end = empty body.
            String id = query.substring(3).replaceAll("&.*", "");
            String body;
            if (query.contains("&page=")) {
                body = textPages.getOrDefault(id + ":" + query.substring(query.indexOf("&page=") + 6), "");
            } else {
                StringBuilder whole = new StringBuilder();
                for (int n = 1; textPages.containsKey(id + ":" + n); n++) {
                    whole.append(textPages.get(id + ":" + n));
                }
                body = whole.toString();
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            respond(ex, textStatus, "text/plain", bytes);
        });
        server.createContext("/cover/", ex -> {
            String path = ex.getRequestURI().getPath();
            coverRequests.add(path);
            if (path.contains("-512-") && !path.contains("has512")) {
                respond(ex, 404, "text/plain", new byte[0]);
            } else {
                respond(ex, 200, "image/jpeg", new byte[] {1, 2, 3});
            }
        });
        server.start();
        client = new WattpadClient("http://127.0.0.1:" + server.getAddress().getPort(), Duration.ofMillis(800),
                new ObjectMapper());
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private static void respond(HttpExchange ex, int code, String type, byte[] bytes) throws IOException {
        ex.getResponseHeaders().add("Content-Type", type);
        ex.sendResponseHeaders(code, bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) {
            ex.getResponseBody().write(bytes);
        }
        ex.close();
    }

    @Test
    void mapsTheFixture() {
        WattpadStory s = client.fetch("396487502");

        assertThat(s.id()).isEqualTo("396487502");
        assertThat(s.title()).isEqualTo("The Way She Warmed Me");
        assertThat(s.author()).isEqualTo("emibonnie");
        assertThat(s.description()).startsWith("Emi never expected").contains("Tiếng Việt, เอมี่");
        assertThat(s.tags()).containsExactly("gl", "emibonnie", "romance", "fluff");
        assertThat(s.coverUrl()).isEqualTo("https://img.wattpad.com/cover/396487502-256-k123456.jpg");
        assertThat(s.readCount()).isEqualTo(51029);
        assertThat(s.voteCount()).isEqualTo(2167);
        assertThat(s.partCount()).isEqualTo(28);
        assertThat(s.wordCount()).isEqualTo(15739);
        assertThat(s.completed()).isTrue();
        assertThat(s.storyUpdatedAt()).isEqualTo(Instant.parse("2026-11-07T12:15:30Z"));
    }

    @Test
    void sendsOurUserAgent() {
        client.fetch("396487502");

        assertThat(userAgents).containsExactly("SubtitleStudio");
    }

    @Test
    void fallsBackToModifyDateWhenNoPartIsPublished() {
        body = body.replaceAll("\"lastPublishedPart\": \\{[^}]*\\},", "");

        assertThat(client.fetch("396487502").storyUpdatedAt()).isEqualTo(Instant.parse("2026-11-08T09:30:00Z"));
    }

    @Test
    void trimsTextFields() {
        body = "{\"id\":\"5\",\"title\":\"Spaced out \",\"user\":{\"username\":\" ann \"}}";

        WattpadStory s = client.fetch("5");

        assertThat(s.title()).isEqualTo("Spaced out");
        assertThat(s.author()).isEqualTo("ann");
    }

    @Test
    void toleratesMissingOptionalFields() {
        body = "{\"id\":\"5\",\"title\":\"Bare\"}";

        WattpadStory s = client.fetch("5");

        assertThat(s.title()).isEqualTo("Bare");
        assertThat(s.author()).isNull();
        assertThat(s.tags()).isEmpty();
        assertThat(s.wordCount()).isZero();
        assertThat(s.partCount()).isZero();
        assertThat(s.storyUpdatedAt()).isNull();
        assertThat(s.completed()).isFalse();
    }

    @Test
    void notFoundWhenWattpadAnswers404Or400() {
        status = 404;
        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(FanficNotFoundException.class);
        status = 400;
        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(FanficNotFoundException.class);
    }

    @Test
    void unavailableOn403And429And500() {
        for (int code : new int[] {403, 429, 500, 503}) {
            status = code;
            assertThatThrownBy(() -> client.fetch("1")).as("status %s", code)
                    .isInstanceOf(WattpadUnavailableException.class);
        }
    }

    @Test
    void unavailableWhenTheBodyIsHtml() {
        body = "<html><body>Just a moment...</body></html>";

        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(WattpadUnavailableException.class);
    }

    @Test
    void unavailableWhenTheJsonHasNoTitle() {
        body = "{\"id\":\"1\"}";

        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(WattpadUnavailableException.class);
    }

    @Test
    void unavailableWhenWattpadIsSlow() {
        delayMs = 3000;

        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(WattpadUnavailableException.class);
    }

    @Test
    void unavailableWhenNothingListens() {
        int port = server.getAddress().getPort();
        server.stop(0);
        WattpadClient dead = new WattpadClient("http://127.0.0.1:" + port, Duration.ofMillis(500), new ObjectMapper());

        assertThatThrownBy(() -> dead.fetch("1")).isInstanceOf(WattpadUnavailableException.class);
    }

    @Test
    void rejectsANonNumericStoryIdWithoutCallingOut() {
        assertThatThrownBy(() -> client.fetch("12/../x")).isInstanceOf(IllegalArgumentException.class);
        assertThat(userAgents).isEmpty();
    }

    @Test
    void coverPrefersThe512VariantThenFallsBack() {
        String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/cover/";

        byte[] big = client.downloadCover(base + "has512-256-k1.jpg");
        byte[] fallback = client.downloadCover(base + "no-256-k1.jpg");

        assertThat(big).containsExactly(1, 2, 3);
        assertThat(fallback).containsExactly(1, 2, 3);
        assertThat(new ArrayList<>(coverRequests)).containsExactly("/cover/has512-512-k1.jpg",
                "/cover/no-512-k1.jpg", "/cover/no-256-k1.jpg");
    }

    @Test
    void coverUnavailableWhenBothVariantsFail() {
        String base = "http://127.0.0.1:" + server.getAddress().getPort();

        assertThatThrownBy(() -> client.downloadCover(base + "/missing/x-256-k1.jpg"))
                .isInstanceOf(WattpadUnavailableException.class);
    }

    @Test
    void storyWithPartsReadsLanguageAndPartsInOrder() throws Exception {
        body = Files.readString(Path.of("src/test/resources/wattpad/story-parts-396487502.json"),
                StandardCharsets.UTF_8);

        WattpadStoryParts s = client.storyWithParts("396487502");

        assertThat(s.languageName()).isEqualTo("English");
        assertThat(s.story().title()).startsWith("The Way She Warmed Me");
        assertThat(s.parts()).extracting(WattpadPart::id)
                .containsExactly("1552276256", "1552277732", "1552278521", "1552279145");
        WattpadPart second = s.parts().get(1);
        assertThat(second.title()).isEqualTo("Chapter 1: Cold Brew, Warm Smile");
        assertThat(second.wordCount()).isEqualTo(951);
        assertThat(second.createdAt()).isEqualTo(Instant.parse("2025-06-22T11:45:43Z"));
        assertThat(second.modifiedAt()).isEqualTo(Instant.parse("2025-06-22T11:45:45Z"));
        assertThat(s.parts().get(2).deleted()).isTrue();
        assertThat(s.parts().get(0).deleted()).isFalse();
    }

    @Test
    void storyWithPartsToleratesNoPartsAndNoLanguage() {
        body = "{\"id\":\"5\",\"title\":\"Bare\"}";

        WattpadStoryParts s = client.storyWithParts("5");

        assertThat(s.parts()).isEmpty();
        assertThat(s.languageName()).isNull();
    }

    @Test
    void partTextReturnsTheHtmlOfASinglePage() {
        textPages.put("77:1", "<p>Hello</p>");

        assertThat(client.partText("77")).isEqualTo("<p>Hello</p>");
        assertThat(textRequests).containsExactly("id=77&page=1", "id=77&page=2");
    }

    @Test
    void partTextFollowsPagesUntilAnEmptyAnswer() {
        textPages.put("77:1", "<p>One</p>");
        textPages.put("77:2", "<p>Two</p>");

        assertThat(client.partText("77")).isEqualTo("<p>One</p><p>Two</p>");
        assertThat(textRequests).containsExactly("id=77&page=1", "id=77&page=2", "id=77&page=3");
    }

    @Test
    void partTextReturnsEachParagraphOnceWhenWattpadPagesThePart() {
        textPages.put("77:1", "<p>A</p><p>B</p>");
        textPages.put("77:2", "<p>C</p>");
        textPages.put("77:3", "<p>D</p><p>E</p>");

        assertThat(client.partText("77")).isEqualTo("<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p>");
    }

    @Test
    void partTextIsEmptyWhenThereIsNoText() {
        assertThat(client.partText("77")).isEmpty();
    }

    @Test
    void partTextIsEmptyForALockedPart() {
        textStatus = 403;

        assertThat(client.partText("77")).isEmpty();
    }

    @Test
    void partTextIsUnavailableOn429And500() {
        for (int code : new int[] {429, 500}) {
            textStatus = code;
            assertThatThrownBy(() -> client.partText("77")).as("status %s", code)
                    .isInstanceOf(WattpadUnavailableException.class);
        }
    }

    @Test
    void partTextRejectsANonNumericIdWithoutCallingOut() {
        assertThatThrownBy(() -> client.partText("7/../x")).isInstanceOf(IllegalArgumentException.class);
        assertThat(textRequests).isEmpty();
    }
}
