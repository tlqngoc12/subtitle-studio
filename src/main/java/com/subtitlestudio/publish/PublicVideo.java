package com.subtitlestudio.publish;

import com.subtitlestudio.video.VideoDto;
import com.subtitlestudio.video.ViSource;
import java.time.Instant;

/**
 * A video as the public site sees it. This is the allowlist: add a field here only if guests may see it
 * (never Engsub details, translation status/errors or profiles).
 */
public record PublicVideo(String id, String title, String channel, Integer durationSec, String thumbnailUrl,
                          int viCueCount, Instant viUpdatedAt, ViSource viSource) {

    public static PublicVideo from(VideoDto v) {
        return new PublicVideo(v.id(), v.title(), v.channel(), v.durationSec(), v.thumbnailUrl(), v.viCueCount(),
                v.viUpdatedAt(), v.viSource());
    }
}
