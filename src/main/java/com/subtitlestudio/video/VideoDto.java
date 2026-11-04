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
        String translationProfile) {

    public static VideoDto from(Video v) {
        return new VideoDto(v.getId(), v.getTitle(), v.getChannel(), v.getDurationSec(), v.getSubLang(),
                v.getSubSource(), v.getCueCount(), v.getFetchedAt(),
                "https://i.ytimg.com/vi/" + v.getId() + "/mqdefault.jpg",
                v.getViCueCount(), v.getViUpdatedAt(),
                v.getViSource(), v.getTranslationStatus(), v.getTranslationError(), v.getTranslationProfile());
    }
}
