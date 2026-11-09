package com.subtitlestudio.novel;

import com.subtitlestudio.translate.TranslationFailedException;
import java.util.List;
import java.util.function.Consumer;

/** Reads the Thai text in a batch of page screenshots and translates it to Vietnamese. */
public interface ChapterTranslator {

    /**
     * @return one page per screenshot, in page order
     * @throws TranslationFailedException with a message for the user
     */
    List<TranslatedPage> translate(ChapterPrompt prompt);

    /**
     * Same, and {@code onTrying} gets the name of each Gemini model right before it is asked, so the UI can show it.
     * The last name reported before a successful return is the model that answered.
     */
    default List<TranslatedPage> translate(ChapterPrompt prompt, Consumer<String> onTrying) {
        return translate(prompt);
    }
}
