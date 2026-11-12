package com.subtitlestudio.photo;

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
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Runs against a local stub server with recorded sample answers; the real X is never called. */
class XClientTest {

    private HttpServer server;
    private XClient client;
    private String origin;
    private final List<String> queries = new CopyOnWriteArrayList<>();
    private final List<String> userAgents = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String body = "";
    private volatile long delayMs;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        origin = "http://127.0.0.1:" + server.getAddress().getPort();
        server.createContext("/tweet-result", ex -> {
            queries.add(ex.getRequestURI().getRawQuery());
            userAgents.add(ex.getRequestHeaders().getFirst("User-Agent"));
            sleep();
            respond(ex, status, "application/json", body.getBytes(StandardCharsets.UTF_8));
        });
        server.createContext("/media/", ex -> {
            String q = ex.getRequestURI().getRawQuery();
            if ("name=orig".equals(q) && ex.getRequestURI().getPath().contains("NOORIG")) {
                respond(ex, 404, "text/plain", new byte[0]);
            } else if (ex.getRequestURI().getPath().contains("HUGE")) {
                respond(ex, 200, "image/jpeg", new byte[10 * 1024 * 1024 + 10]);
            } else {
                respond(ex, 200, "image/jpeg", new byte[] {1, 2, 3});
            }
        });
        server.start();
        client = new XClient(origin, Duration.ofMillis(500), Duration.ofMillis(800), "127.0.0.1", new ObjectMapper());
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private void sleep() {
        if (delayMs > 0) {
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private static void respond(HttpExchange ex, int code, String type, byte[] bytes) throws IOException {
        ex.getResponseHeaders().add("Content-Type", type);
        ex.sendResponseHeaders(code, bytes.length == 0 ? -1 : bytes.length);
        if (bytes.length > 0) {
            ex.getResponseBody().write(bytes);
        }
        ex.close();
    }

    private void fixture(String name) throws IOException {
        body = Files.readString(Path.of("src/test/resources/x/" + name), StandardCharsets.UTF_8)
                .replace("{{IMG}}", origin);
    }

    // Expected values come from react-tweet's formula run in node: ((Number(id) / 1e15) * Math.PI).toString(36).
    @ParameterizedTest
    @CsvSource({
            "1,bhi2ay3f28n", "20,6dq1a2xwd93", "1519781379,8p4d7pigjk", "1000000000000000,353i5ab8p5f",
            "1234567890123456789,2zqic77uqyk", "1700000000000000000,44cpgxmyurn",
            "1845312345678901234,4h17wqqcr78", "1990000000000000000,4tnrp481eua",
            "1990123456789012345,4to5nrsop2n", "1580661436132757504,3txslhgbjje",
            "1999999999999999999,4uj6o5owj98", "2050000000000000001,4yw9jd185c6",
            "9007199254740993,saoujnx4as", "12345678901234567890,txd3e6jhlg"})
    void tokenMatchesReactTweet(String id, String expected) {
        assertThat(XClient.token(id)).isEqualTo(expected);
    }

    @Test
    void readsAPhotoPost() throws Exception {
        fixture("photo-tweet.json");

        XTweet t = client.fetch("1990123456789012345");

        assertThat(t.imageUrl()).isEqualTo(origin + "/media/ABC.jpg");
        assertThat(t.createdAt()).isEqualTo(Instant.parse("2026-11-10T18:30:00Z"));
        assertThat(t.text()).startsWith("Emi at the fan meeting");
        assertThat(queries.get(0))
                .isEqualTo("id=1990123456789012345&lang=en&token=" + XClient.token("1990123456789012345"));
        assertThat(userAgents.get(0)).isEqualTo("SubtitleStudio");
    }

    @Test
    void usesThePosterOfAVideoAndTheOlderDateFormat() throws Exception {
        fixture("video-tweet.json");

        XTweet t = client.fetch("1990123456789012346");

        assertThat(t.imageUrl()).endsWith("/POSTER.jpg");
        assertThat(t.createdAt()).isEqualTo(Instant.parse("2026-11-10T18:30:00Z"));
    }

    @Test
    void aTextOnlyPostHasNoImage() throws Exception {
        fixture("text-tweet.json");

        assertThat(client.fetch("1990123456789012347").imageUrl()).isNull();
    }

    @Test
    void tombstoneEmptyAnd404AreNotFound() throws Exception {
        fixture("tombstone.json");
        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(XPostNotFoundException.class);
        fixture("empty.json");
        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(XPostNotFoundException.class);
        status = 404;
        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(XPostNotFoundException.class);
    }

    @ParameterizedTest
    @CsvSource({"429", "500", "503", "403"})
    void otherStatusesAreUnavailable(int code) {
        status = code;
        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(XUnavailableException.class);
    }

    @Test
    void aTimeoutAndNonJsonAreUnavailable() {
        delayMs = 1500;
        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(XUnavailableException.class);
        delayMs = 0;
        body = "<html>nope</html>";
        assertThatThrownBy(() -> client.fetch("1")).isInstanceOf(XUnavailableException.class);
    }

    @Test
    void downloadsTheOriginalSizeFirstThenFallsBack() {
        assertThat(client.downloadImage(origin + "/media/ABC.jpg", "1")).containsExactly(1, 2, 3);
        assertThat(client.downloadImage(origin + "/media/NOORIG.jpg", "1")).containsExactly(1, 2, 3);
    }

    @Test
    void refusesHugeImagesAndForeignHosts() {
        assertThatThrownBy(() -> client.downloadImage(origin + "/media/HUGE.jpg", "1"))
                .isInstanceOf(XUnavailableException.class);
        assertThatThrownBy(() -> client.downloadImage("https://example.com/a.jpg", "1"))
                .isInstanceOf(XUnavailableException.class);
    }
}
