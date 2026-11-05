package com.subtitlestudio.novel;

import com.subtitlestudio.translate.TranslationFailedException;
import java.util.List;

/** Reads the Thai text in a batch of page screenshots and translates it to Vietnamese. */
public interface ChapterTranslator {

    /**
     * @return one page per screenshot, in page order
     * @throws TranslationFailedException with a message for the user
     */
    List<TranslatedPage> translate(ChapterPrompt prompt);
}
