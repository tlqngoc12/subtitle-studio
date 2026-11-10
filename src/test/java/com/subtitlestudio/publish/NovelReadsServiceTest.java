package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class NovelReadsServiceTest {

    private HttpServer server;

    @AfterEach
    void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    private URI serve(int status, String body) throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/reads", exchange -> {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/api/reads");
    }

    @Test
    void returnsTheCountsOfThePublishedSite() throws Exception {
        assertThat(new NovelReadsService(serve(200, "{\"summer\":12,\"winter\":3}")).counts())
                .containsEntry("summer", 12L).containsEntry("winter", 3L).hasSize(2);
    }

    @Test
    void isEmptyWhenOff() {
        assertThat(new NovelReadsService((URI) null).counts()).isEmpty();
    }

    @Test
    void isEmptyOnAnErrorStatusOrGarbage() throws Exception {
        assertThat(new NovelReadsService(serve(503, "{}")).counts()).isEmpty();
        server.stop(0);
        assertThat(new NovelReadsService(serve(200, "<html>")).counts()).isEmpty();
    }

    @Test
    void isEmptyWhenUnreachable() throws Exception {
        URI dead = serve(200, "{}");
        server.stop(0);
        assertThat(new NovelReadsService(dead).counts()).isEmpty();
    }
}
