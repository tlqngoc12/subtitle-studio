package com.subtitlestudio.video;

import com.subtitlestudio.subtitle.SourceType;
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
        EditStatus editStatus) {

    public static VideoDto from(Video v) {
        return from(v, null);
    }

    /**
     * {@code activeModel}: the model a running translation is asking now. While TRANSLATING that is what is shown
     * (null until the first model is tried); otherwise the model stored by the last successful translation.
     */
    public static VideoDto from(Video v, String activeModel) {
        return new VideoDto(v.getId(), v.getTitle(), v.getChannel(), v.getDurationSec(), v.getSubLang(),
                v.getSubSource(), v.getCueCount(), v.getFetchedAt(),
                "https://i.ytimg.com/vi/" + v.getId() + "/mqdefault.jpg",
                v.getViCueCount(), v.getViUpdatedAt(),
                v.getViSource(), v.getTranslationStatus(), v.getTranslationError(), v.getTranslationProfile(),
                v.getTranslationStatus() == TranslationStatus.TRANSLATING ? activeModel : v.getTranslationModel(),
                v.getEditStatus());
    }
}
