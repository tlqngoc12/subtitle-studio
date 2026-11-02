package com.subtitlestudio.subtitle;

import com.subtitlestudio.ytdlp.VideoInfo;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Picks the English subtitle track to download.
 *
 * <p>Priority: manual {@code en}, {@code en-US}, {@code en-GB}, then any other manual {@code en-*}
 * (alphabetically, for determinism); then auto {@code en-orig}, then auto {@code en}.
 */
@Component
public class SubtitleTrackSelector {

    private static final List<String> MANUAL_PREFERRED = List.of("en", "en-US", "en-GB");
    private static final List<String> AUTO_PREFERRED = List.of("en-orig", "en");

    public SubtitleTrack select(VideoInfo info) {
        return selectManual(info.subtitleLangs())
                .map(lang -> new SubtitleTrack(lang, SourceType.MANUAL))
                .or(() -> firstPresent(AUTO_PREFERRED, info.autoCaptionLangs())
                        .map(lang -> new SubtitleTrack(lang, SourceType.AUTO)))
                .orElseThrow(() -> new NoEnglishSubtitleException(info.id()));
    }

    private static Optional<String> selectManual(Set<String> langs) {
        return firstPresent(MANUAL_PREFERRED, langs)
                .or(() -> langs.stream().filter(l -> l.startsWith("en-")).sorted().findFirst());
    }

    private static Optional<String> firstPresent(List<String> preferred, Set<String> available) {
        return preferred.stream().filter(available::contains).findFirst();
    }
}
