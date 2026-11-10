package com.subtitlestudio.translate;

import java.util.List;

/**
 * Extra context for the translation.
 *
 * @param description the cleaned YouTube description, or null
 * @param examples    approved pairs from earlier episodes with the same profile; empty when there are none
 * @param previousLines the last lines (English + Vietnamese) of the part translated just before this one, for a
 *                    long video translated in parts; empty for the first part and for short videos
 */
public record VideoContext(String title, String channel, String description, List<ExamplePair> examples,
                           List<ExamplePair> previousLines) {

    public VideoContext {
        examples = examples == null ? List.of() : List.copyOf(examples);
        previousLines = previousLines == null ? List.of() : List.copyOf(previousLines);
    }

    /** Without a previous part. */
    public VideoContext(String title, String channel, String description, List<ExamplePair> examples) {
        this(title, channel, description, examples, List.of());
    }

    /** Title and channel only. */
    public VideoContext(String title, String channel) {
        this(title, channel, null, List.of(), List.of());
    }
}
