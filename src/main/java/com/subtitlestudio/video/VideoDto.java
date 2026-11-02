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
        Instant viUpdatedAt) {

    static VideoDto from(Video v) {
        return new VideoDto(v.getId(), v.getTitle(), v.getChannel(), v.getDurationSec(), v.getSubLang(),
                v.getSubSource(), v.getCueCount(), v.getFetchedAt(),
                "https://i.ytimg.com/vi/" + v.getId() + "/mqdefault.jpg",
                v.getViCueCount(), v.getViUpdatedAt());
    }
}
