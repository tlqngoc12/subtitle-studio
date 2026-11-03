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
 *
 * <p>Auto {@code en} is skipped when another language is the original ({@code xx-orig}): YouTube then
 * offers {@code en} only as a machine translation of that language ({@code tlang=en}), which is not real
 * English subtitles and whose download YouTube often refuses with HTTP 429.
 */
@Component
public class SubtitleTrackSelector {

    private static final List<String> MANUAL_PREFERRED = List.of("en", "en-US", "en-GB");
    private static final List<String> AUTO_PREFERRED = List.of("en-orig", "en");
    private static final String ORIGINAL_SUFFIX = "-orig";

    public SubtitleTrack select(VideoInfo info) {
        return selectManual(info.subtitleLangs())
                .map(lang -> new SubtitleTrack(lang, SourceType.MANUAL))
                .or(() -> firstPresent(AUTO_PREFERRED, info.autoCaptionLangs())
                        .filter(lang -> !lang.equals("en") || !hasForeignOriginal(info.autoCaptionLangs()))
                        .map(lang -> new SubtitleTrack(lang, SourceType.AUTO)))
                .orElseThrow(() -> new NoEnglishSubtitleException(info.id()));
    }

    /** True when the auto captions are originally in a language other than English. */
    private static boolean hasForeignOriginal(Set<String> autoLangs) {
        return autoLangs.stream().anyMatch(l -> l.endsWith(ORIGINAL_SUFFIX) && !l.equals("en" + ORIGINAL_SUFFIX));
    }

    private static Optional<String> selectManual(Set<String> langs) {
        return firstPresent(MANUAL_PREFERRED, langs)
                .or(() -> langs.stream().filter(l -> l.startsWith("en-")).sorted().findFirst());
    }

    private static Optional<String> firstPresent(List<String> preferred, Set<String> available) {
        return preferred.stream().filter(available::contains).findFirst();
    }
}
