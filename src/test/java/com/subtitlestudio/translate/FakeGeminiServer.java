package com.subtitlestudio.translate;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

/** A local stand-in for the Gemini REST API: records the last request, replies with a canned response. */
public final class FakeGeminiServer implements AutoCloseable {

    private final HttpServer server;
    private final AtomicInteger requests = new AtomicInteger();
    private final java.util.Map<String, Reply> perModel = new java.util.concurrent.ConcurrentHashMap<>();
    /** Replies used once each, in order, before the default reply. */
    private final java.util.Queue<Reply> queued = new java.util.concurrent.ConcurrentLinkedQueue<>();
    private final java.util.List<String> bodies = new java.util.concurrent.CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String body = "{}";
    private volatile Duration delay = Duration.ZERO;
    private volatile String lastPath;
    private volatile String lastBody;

    public FakeGeminiServer() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        server.createContext("/", exchange -> {
            requests.incrementAndGet();
            lastPath = exchange.getRequestURI().getPath();
            lastBody = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            try {
                Thread.sleep(delay.toMillis());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            bodies.add(lastBody);
            int replyStatus = status;
            String replyBody = body;
            Reply next = queued.poll();
            if (next != null) {
                replyStatus = next.status();
                replyBody = next.body();
            }
            for (var entry : perModel.entrySet()) {
                if (lastPath.contains("/models/" + entry.getKey() + ":")) {
                    replyStatus = entry.getValue().status();
                    replyBody = entry.getValue().body();
                }
            }
            byte[] bytes = replyBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(replyStatus, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            } catch (IOException ignored) {
                // the client gave up (timeout test)
            }
        });
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/";
    }

    /** A successful generateContent reply whose text is {@code text}. */
    /** Queues a successful reply whose text is {@code text}; queued replies are used once, in order. */
    public void queueText(String text) {
        queued.add(new Reply(200, textBody(text, "STOP")));
    }

    /** Same, with the given finish reason (e.g. MAX_TOKENS). */
    public void queueText(String text, String finishReason) {
        queued.add(new Reply(200, textBody(text, finishReason)));
    }

    /** Every request body received, in order. */
    public java.util.List<String> bodies() {
        return java.util.List.copyOf(bodies);
    }

    private static String textBody(String text, String finishReason) {
        String escaped = text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
        return "{\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"" + escaped
                + "\"}]},\"finishReason\":\"" + finishReason + "\"}]}";
    }

    public void replyText(String text, String finishReason) {
        reply(200, textBody(text, finishReason));
    }

    public void reply(int status, String body) {
        this.status = status;
        this.body = body;
    }

    /** A reply used only for requests to {@code model}; other models get the default reply. */
    public void replyForModel(String model, int status, String body) {
        perModel.put(model, new Reply(status, body));
    }

    private record Reply(int status, String body) {}

    public void delay(Duration delay) {
        this.delay = delay;
    }

    public int requests() {
        return requests.get();
    }

    public String lastPath() {
        return lastPath;
    }

    public String lastBody() {
        return lastBody;
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
