package com.subtitlestudio.translate;

import com.subtitlestudio.config.SubtitleStudioProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PromptProfileController {

    private final PromptProfileStore store;
    private final SubtitleStudioProperties properties;

    public PromptProfileController(PromptProfileStore store, SubtitleStudioProperties properties) {
        this.store = store;
        this.properties = properties;
    }

    @GetMapping("/api/prompt-profiles")
    public PromptProfilesDto list() {
        return new PromptProfilesDto(properties.gemini().configured(), store.list());
    }
}
