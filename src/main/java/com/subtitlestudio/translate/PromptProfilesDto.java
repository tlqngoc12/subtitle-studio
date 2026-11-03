package com.subtitlestudio.translate;

import java.util.List;

/** Body of {@code GET /api/prompt-profiles}: whether Gemini is configured, and the profile names. */
public record PromptProfilesDto(boolean configured, List<String> profiles) {}
