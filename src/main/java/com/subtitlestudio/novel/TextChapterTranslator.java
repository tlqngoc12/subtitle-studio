package com.subtitlestudio.novel;

import com.subtitlestudio.translate.TranslationFailedException;
import java.util.function.Consumer;

/** Translates text (a whole Wattpad chapter, or one part of it) to Vietnamese in one request. */
public interface TextChapterTranslator {

    /**
     * @param onTrying gets the name of each Gemini model right before it is asked
     * @throws TextIncompleteException when the answer was cut off or implausibly short
     * @throws TranslationFailedException with a message for the user
     */
    TextAnswer translate(TextChapterPrompt prompt, Consumer<String> onTrying);
}
