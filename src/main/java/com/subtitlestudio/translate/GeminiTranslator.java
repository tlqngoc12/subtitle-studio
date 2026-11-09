package com.subtitlestudio.translate;

import java.util.List;
import java.util.function.Consumer;

/** Translates subtitle blocks to Vietnamese. Implementations never log or expose the API key. */
public interface GeminiTranslator {

    /**
     * Returns one line per input {@code id}, in input order.
     *
     * @throws TranslationFailedException with a Vietnamese message for the user
     */
    List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines);

    /** Same, and {@code onTrying} gets the name of each Gemini model right before it is asked. */
    default List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines,
                                           Consumer<String> onTrying) {
        return translate(video, profile, lines);
    }
}
