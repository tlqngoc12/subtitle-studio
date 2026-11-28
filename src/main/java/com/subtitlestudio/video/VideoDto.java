package com.subtitlestudio.video;

import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.translate.GeminiCaller;
import java.time.Instant;

/** JSON view of a {@link Video}; keeps the JPA entity out of the API. */
public record VideoDto(
        String id,
        String title,
        String channel,
        Integer durationSec,
        String subLang,
        SourceType subSource,
        int cueCount,
        Instant fetchedAt,
        String thumbnailUrl,
        int viCueCount,
        Instant viUpdatedAt,
        ViSource viSource,
        TranslationStatus translationStatus,
        String translationError,
        String translationProfile,
        String translationModel,
        EditStatus editStatus,
        String activePart,
        boolean translatedByFallback,
        boolean viManualFile) {

    public static VideoDto from(Video v) {
        return from(v, null);
    }

    /**
     * {@code activeModel}: the model a running translation is asking now. While TRANSLATING that is what is shown
     * (null until the first model is tried); otherwise the model stored by the last successful translation.
     */
    public static VideoDto from(Video v, String activeModel) {
        return from(v, activeModel, null);
    }

    /** {@code activePart}: "2/3" while a long video is translated in parts; null otherwise. */
    public static VideoDto from(Video v, String activeModel, String activePart) {
        return from(v, activeModel, activePart, null);
    }

    /**
     * {@code mainModel}: the configured main Gemini model; {@code translatedByFallback} is true when the shown
     * translation model names any other model (null = not known, so false).
     */
    public static VideoDto from(Video v, String activeModel, String activePart, String mainModel) {
        return from(v, activeModel, activePart, mainModel, false);
    }

    /** {@code viManualFile}: whether {@code <id>.vi_manual.srt} exists on disk (the editor's Reload from file). */
    public static VideoDto from(Video v, String activeModel, String activePart, String mainModel,
                                boolean viManualFile) {
        String shownModel = v.getTranslationStatus() == TranslationStatus.TRANSLATING ? activeModel
                : v.getTranslationModel();
        return new VideoDto(v.getId(), v.getTitle(), v.getChannel(), v.getDurationSec(), v.getSubLang(),
                v.getSubSource(), v.getCueCount(), v.getFetchedAt(),
                "https://i.ytimg.com/vi/" + v.getId() + "/mqdefault.jpg",
                v.getViCueCount(), v.getViUpdatedAt(),
                v.getViSource(), v.getTranslationStatus(), v.getTranslationError(), v.getTranslationProfile(),
                shownModel,
                v.getEditStatus(),
                v.getTranslationStatus() == TranslationStatus.TRANSLATING ? activePart : null,
                mainModel != null && GeminiCaller.translatedByFallback(shownModel, mainModel),
                viManualFile);
    }
}
