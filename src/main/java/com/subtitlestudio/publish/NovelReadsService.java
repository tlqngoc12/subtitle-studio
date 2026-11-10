package com.subtitlestudio.publish;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Novel read totals for the admin app: asks the published site's own public {@code GET /api/reads} (no token needed).
 * Off, unreachable or malformed answers all give an empty map, so the admin page just shows no numbers.
 */
@Service
public class NovelReadsService {

    private static final Logger log = LoggerFactory.getLogger(NovelReadsService.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private final URI endpoint;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    private final ObjectMapper mapper = new ObjectMapper();

    @Autowired
    public NovelReadsService(SubtitleStudioProperties properties) {
        this(properties.publish().readCountsEnabled() ? URI.create(properties.publish().url() + "/api/reads") : null);
    }

    NovelReadsService(URI endpoint) {
        this.endpoint = endpoint;
    }

    /** {@code slug -> reads}; empty when read counts are off or cannot be fetched. */
    public Map<String, Long> counts() {
        if (endpoint == null) {
            return Map.of();
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(TIMEOUT).GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Read counts answered HTTP {}", response.statusCode());
                return Map.of();
            }
            Map<String, Number> raw = mapper.readValue(response.body(), new TypeReference<>() {
            });
            Map<String, Long> counts = new LinkedHashMap<>();
            raw.forEach((slug, n) -> counts.put(slug, n.longValue()));
            return counts;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Map.of();
        } catch (Exception e) {
            log.warn("Could not fetch read counts ({})", e.getClass().getSimpleName());
            return Map.of();
        }
    }
}
