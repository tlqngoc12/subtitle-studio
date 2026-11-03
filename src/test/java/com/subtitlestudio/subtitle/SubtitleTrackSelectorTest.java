package com.subtitlestudio.subtitle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.ytdlp.VideoInfo;
import com.subtitlestudio.ytdlp.VideoInfoParser;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class SubtitleTrackSelectorTest {

    private final SubtitleTrackSelector selector = new SubtitleTrackSelector();

    @Nested
    class FromYtDlpJson {

        private final VideoInfoParser parser = new VideoInfoParser();

        @Test
        void manualOnly() {
            assertThat(selector.select(parser.parse(fixture("ytdlp/info-manual-only.json"))))
                    .isEqualTo(new SubtitleTrack("en", SourceType.MANUAL));
        }

        @Test
        void autoOnly() {
            assertThat(selector.select(parser.parse(fixture("ytdlp/info-auto-only.json"))))
                    .isEqualTo(new SubtitleTrack("en-orig", SourceType.AUTO));
        }

        @Test
        void bothPrefersManual() {
            assertThat(selector.select(parser.parse(fixture("ytdlp/info-both.json"))))
                    .isEqualTo(new SubtitleTrack("en-GB", SourceType.MANUAL));
        }

        @Test
        void noEnglish() {
            VideoInfo info = parser.parse(fixture("ytdlp/info-no-english.json"));

            assertThatThrownBy(() -> selector.select(info))
                    .isInstanceOf(NoEnglishSubtitleException.class)
                    .hasMessageContaining("NOEN0000001");
        }

        /** Real case (I-yJxYCP8B0): Thai original, YouTube offers "en" only as a machine translation (tlang=en). */
        @Test
        void machineTranslatedEnglishIsNotEnglish() {
            VideoInfo info = parser.parse(fixture("ytdlp/info-machine-translated-en.json"));

            assertThatThrownBy(() -> selector.select(info))
                    .isInstanceOf(NoEnglishSubtitleException.class)
                    .hasMessageContaining("I-yJxYCP8B0");
        }
    }

    @Nested
    class ManualPriority {

        @Test
        void enBeatsRegionalVariants() {
            assertThat(selectManual("en-GB", "en-US", "en")).isEqualTo("en");
        }

        @Test
        void enUsBeatsEnGb() {
            assertThat(selectManual("en-GB", "en-US")).isEqualTo("en-US");
        }

        @Test
        void enGbBeatsOtherVariants() {
            assertThat(selectManual("en-AU", "en-GB")).isEqualTo("en-GB");
        }

        @Test
        void anyOtherEnVariantIsPickedAlphabetically() {
            assertThat(selectManual("en-IE", "en-CA", "en-AU")).isEqualTo("en-AU");
        }

        @Test
        void doesNotMistakeOtherLanguagesStartingWithEn() {
            VideoInfo info = info(Set.of("eng", "enm"), Set.of());

            assertThatThrownBy(() -> selector.select(info)).isInstanceOf(NoEnglishSubtitleException.class);
        }

        private String selectManual(String... langs) {
            SubtitleTrack track = selector.select(info(Set.of(langs), Set.of("en-orig", "en")));
            assertThat(track.source()).isEqualTo(SourceType.MANUAL);
            return track.lang();
        }
    }

    @Nested
    class AutoPriority {

        @Test
        void enOrigBeatsEn() {
            assertThat(selector.select(info(Set.of(), Set.of("en", "en-orig"))))
                    .isEqualTo(new SubtitleTrack("en-orig", SourceType.AUTO));
        }

        @Test
        void fallsBackToEn() {
            assertThat(selector.select(info(Set.of(), Set.of("en", "fr"))))
                    .isEqualTo(new SubtitleTrack("en", SourceType.AUTO));
        }

        @Test
        void usesAutoWhenManualHasNoEnglish() {
            assertThat(selector.select(info(Set.of("fr", "de"), Set.of("en-orig"))))
                    .isEqualTo(new SubtitleTrack("en-orig", SourceType.AUTO));
        }

        @Test
        void skipsAutoEnWhenAnotherLanguageIsTheOriginal() {
            VideoInfo info = info(Set.of(), Set.of("th-orig", "th", "en", "vi"));

            assertThatThrownBy(() -> selector.select(info)).isInstanceOf(NoEnglishSubtitleException.class);
        }

        @Test
        void manualEnglishStillWinsOverAForeignOriginal() {
            assertThat(selector.select(info(Set.of("en"), Set.of("th-orig", "en"))))
                    .isEqualTo(new SubtitleTrack("en", SourceType.MANUAL));
        }

        @Test
        void enOrigIsKeptEvenWhenOtherOriginalsAreListed() {
            assertThat(selector.select(info(Set.of(), Set.of("th-orig", "en-orig", "en"))))
                    .isEqualTo(new SubtitleTrack("en-orig", SourceType.AUTO));
        }

        @Test
        void ignoresAutoRegionalVariants() {
            VideoInfo info = info(Set.of(), Set.of("en-US", "fr"));

            assertThatThrownBy(() -> selector.select(info)).isInstanceOf(NoEnglishSubtitleException.class);
        }
    }

    private static VideoInfo info(Set<String> manual, Set<String> auto) {
        return new VideoInfo("dQw4w9WgXcQ", "title", "channel", 60, manual, auto);
    }

    private static String fixture(String path) {
        try (InputStream in = SubtitleTrackSelectorTest.class.getClassLoader().getResourceAsStream(path)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
