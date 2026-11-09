package com.subtitlestudio.novel;

import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * The Gemini model each running chapter translation is asking right now (in memory only: a run dies with the
 * process). {@link #shown} is what the API reports: the active model while TRANSLATING, else the stored one.
 */
@Component
public class TranslatingModels {

    private final ConcurrentHashMap<Long, String> active = new ConcurrentHashMap<>();

    public void set(long chapterId, String model) {
        active.put(chapterId, model);
    }

    public void clear(long chapterId) {
        active.remove(chapterId);
    }

    public String get(long chapterId) {
        return active.get(chapterId);
    }

    String shown(Chapter c) {
        return c.getTranslationStatus() == ChapterTranslationStatus.TRANSLATING ? active.get(c.getId())
                : c.getTranslationModel();
    }
}
