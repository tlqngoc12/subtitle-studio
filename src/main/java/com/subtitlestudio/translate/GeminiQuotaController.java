package com.subtitlestudio.translate;

import com.subtitlestudio.config.GeminiSettings;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Which Gemini models are out of quota right now. In memory and cheap; never calls Gemini. */
@RestController
public class GeminiQuotaController {

    public record Exhausted(String model, GeminiQuotaTracker.QuotaKind kind, Instant resetAt) {}

    public record Quota(List<Exhausted> exhausted, String nowUsing) {}

    private final GeminiQuotaTracker tracker;
    private final GeminiSettings settings;

    public GeminiQuotaController(GeminiQuotaTracker tracker, GeminiSettings settings) {
        this.tracker = tracker;
        this.settings = settings;
    }

    @GetMapping("/api/gemini/quota")
    public Quota quota() {
        List<Exhausted> exhausted = tracker.active().stream()
                .map(e -> new Exhausted(e.model(), e.kind(), e.resetAt())).toList();
        return new Quota(exhausted, tracker.firstAvailable(GeminiCaller.modelOrder(settings.current())));
    }
}
