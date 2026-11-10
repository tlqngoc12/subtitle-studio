package com.subtitlestudio.translate;

import java.util.List;

/**
 * Extra context for the translation.
 *
 * @param description the cleaned YouTube description, or null
 * @param examples    approved pairs from earlier episodes with the same profile; empty when there are none
 */
public record VideoContext(String title, String channel, String description, List<ExamplePair> examples) {

    public VideoContext {
        examples = examples == null ? List.of() : List.copyOf(examples);
    }

    /** Title and channel only. */
    public VideoContext(String title, String channel) {
        this(title, channel, null, List.of());
    }
}
