package com.subtitlestudio.translate;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PromptProfileController {

    /** Body of {@code PUT /api/prompt-profiles/{name}}: the new text and the SHA of the text it was based on. */
    public record SaveRequest(String text, String baseSha) {}

    private final PromptProfileStore store;
    private final SubtitleStudioProperties properties;
    private final ProfileAnalyzer analyzer;

    public PromptProfileController(PromptProfileStore store, SubtitleStudioProperties properties,
                                   ProfileAnalyzer analyzer) {
        this.store = store;
        this.properties = properties;
        this.analyzer = analyzer;
    }

    @GetMapping("/api/prompt-profiles")
    public PromptProfilesDto list() {
        return new PromptProfilesDto(properties.gemini().configured(), store.list());
    }

    @GetMapping("/api/prompt-profiles/{name}")
    public ProfileAnalyzer.Details details(@PathVariable String name) {
        return analyzer.details(name);
    }

    /** Runs one Gemini call (10 to 60 seconds); writes nothing. */
    @PostMapping("/api/prompt-profiles/{name}/analyze")
    public ProfileAnalyzer.Analysis analyze(@PathVariable String name) {
        return analyzer.analyze(name);
    }

    @PutMapping("/api/prompt-profiles/{name}")
    public Map<String, String> save(@PathVariable String name, @RequestBody SaveRequest body) {
        return Map.of("sha", store.write(name, body.text(), body.baseSha()));
    }
}
