package com.subtitlestudio.novel;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.PromptProfilesDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Novel translation profiles for the novel form (the Vietsub ones are at {@code /api/prompt-profiles}). */
@RestController
public class NovelProfileController {

    private final NovelProfileStore store;
    private final SubtitleStudioProperties properties;

    public NovelProfileController(NovelProfileStore store, SubtitleStudioProperties properties) {
        this.store = store;
        this.properties = properties;
    }

    @GetMapping("/api/novel-profiles")
    public PromptProfilesDto list() {
        return new PromptProfilesDto(properties.gemini().configured(), store.list());
    }
}
