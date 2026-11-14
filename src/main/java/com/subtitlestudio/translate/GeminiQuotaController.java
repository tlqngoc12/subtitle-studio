package com.subtitlestudio.translate;

import com.subtitlestudio.config.SubtitleStudioProperties;
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
    private final SubtitleStudioProperties properties;

    public GeminiQuotaController(GeminiQuotaTracker tracker, SubtitleStudioProperties properties) {
        this.tracker = tracker;
        this.properties = properties;
    }

    @GetMapping("/api/gemini/quota")
    public Quota quota() {
        List<Exhausted> exhausted = tracker.active().stream()
                .map(e -> new Exhausted(e.model(), e.kind(), e.resetAt())).toList();
        return new Quota(exhausted, tracker.firstAvailable(GeminiCaller.modelOrder(properties.gemini())));
    }
}
