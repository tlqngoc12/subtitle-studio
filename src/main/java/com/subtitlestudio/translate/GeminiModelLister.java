package com.subtitlestudio.translate;

import com.google.genai.Client;
import com.google.genai.types.HttpOptions;
import com.google.genai.types.ListModelsConfig;
import com.google.genai.types.Model;
import com.subtitlestudio.config.GeminiSettings;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The Gemini models the Settings form offers: {@code gemini-*} models that support {@code generateContent}, sorted by
 * name. The list is cached for an hour. A missing key or any failure gives an empty list (the form then accepts free
 * text); the failure is logged without the key and is not cached.
 */
@Component
public class GeminiModelLister {

    private static final Logger log = LoggerFactory.getLogger(GeminiModelLister.class);
    private static final Duration TTL = Duration.ofHours(1);

    private final Supplier<List<Model>> source;
    private final Clock clock;
    private List<String> cached;
    private Instant cachedAt;

    @Autowired
    public GeminiModelLister(GeminiSettings settings, Clock clock) {
        this(() -> fetch(settings), clock);
    }

    /** The SDK call is a seam so tests can supply the models. */
    GeminiModelLister(Supplier<List<Model>> source, Clock clock) {
        this.source = source;
        this.clock = clock;
    }

    public synchronized List<String> list() {
        Instant now = clock.instant();
        if (cached != null && now.isBefore(cachedAt.plus(TTL))) {
            return cached;
        }
        try {
            List<String> names = new ArrayList<>();
            for (Model model : source.get()) {
                String name = model.name().orElse("");
                if (name.startsWith("models/")) {
                    name = name.substring("models/".length());
                }
                if (name.startsWith("gemini-")
                        && model.supportedActions().orElse(List.of()).contains("generateContent")) {
                    names.add(name);
                }
            }
            names.sort(String::compareTo);
            cached = List.copyOf(names);
            cachedAt = now;
            return cached;
        } catch (RuntimeException e) {
            // Only the exception type: the message may echo the request.
            log.warn("Could not load the Gemini model list: {}", e.getClass().getSimpleName());
            return List.of();
        }
    }

    private static List<Model> fetch(GeminiSettings settings) {
        var gemini = settings.current();
        if (!gemini.configured()) {
            throw new IllegalStateException("no API key");
        }
        var http = HttpOptions.builder().timeout(10_000).build();
        try (Client client = Client.builder().apiKey(gemini.apiKey()).httpOptions(http).build()) {
            List<Model> all = new ArrayList<>();
            client.models.list(ListModelsConfig.builder().pageSize(100).build()).forEach(all::add);
            return all;
        }
    }
}
