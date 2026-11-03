package com.subtitlestudio.translate;

import java.util.List;

/** Translates subtitle blocks to Vietnamese. Implementations never log or expose the API key. */
public interface GeminiTranslator {

    /**
     * Returns one line per input {@code id}, in input order.
     *
     * @throws TranslationFailedException with a Vietnamese message for the user
     */
    List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines);
}
