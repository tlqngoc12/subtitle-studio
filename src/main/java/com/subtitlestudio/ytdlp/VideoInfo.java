package com.subtitlestudio.ytdlp;

import java.util.Set;

/**
 * Video metadata from {@code yt-dlp -J}.
 *
 * @param subtitleLangs    languages with creator-uploaded subtitles (non-empty tracks only)
 * @param autoCaptionLangs languages with YouTube auto-generated captions (non-empty tracks only)
 */
public record VideoInfo(
        String id,
        String title,
        String channel,
        Integer durationSec,
        Set<String> subtitleLangs,
        Set<String> autoCaptionLangs) {

    public VideoInfo {
        subtitleLangs = Set.copyOf(subtitleLangs);
        autoCaptionLangs = Set.copyOf(autoCaptionLangs);
    }
}
