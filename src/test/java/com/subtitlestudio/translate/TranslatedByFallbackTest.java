package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoDto;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class TranslatedByFallbackTest {

    private static final String MAIN = "gemini-3.6-flash";
    private static final String LITE = "gemini-3.5-flash-lite";

    @Test
    void mainModelOnlyIsNotFallback() {
        assertThat(GeminiCaller.translatedByFallback(MAIN, MAIN)).isFalse();
        assertThat(GeminiCaller.translatedByFallback(MAIN + ", " + MAIN, MAIN)).isFalse();
    }

    @Test
    void aFallbackModelIsFlagged() {
        assertThat(GeminiCaller.translatedByFallback(LITE, MAIN)).isTrue();
    }

    @Test
    void anyFallbackAmongSeveralModelsIsFlagged() {
        assertThat(GeminiCaller.translatedByFallback(MAIN + ", " + LITE, MAIN)).isTrue();
        assertThat(GeminiCaller.translatedByFallback(LITE + "," + MAIN, MAIN)).isTrue();
    }

    @Test
    void unknownModelIsNotFlagged() {
        assertThat(GeminiCaller.translatedByFallback(null, MAIN)).isFalse();
        assertThat(GeminiCaller.translatedByFallback("  ", MAIN)).isFalse();
    }

    @Test
    void videoDtoCarriesTheFlag() {
        Video v = new Video("abc");
        v.setTranslationModel(LITE);

        assertThat(VideoDto.from(v, null, null, MAIN).translatedByFallback()).isTrue();
        assertThat(VideoDto.from(v).translatedByFallback()).isFalse();
        v.setTranslationModel(MAIN);
        assertThat(VideoDto.from(v, null, null, MAIN).translatedByFallback()).isFalse();
    }

    @Test
    void thinkingLevelIsValidatedAtStartup() {
        assertThatThrownBy(() -> gemini("extreme")).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("thinking-level");
        assertThat(gemini("").translationThinking()).isNull();
        assertThat(gemini(null).translationThinking()).isNull();
        assertThat(gemini("Low").translationThinking()).isNotNull();
    }

    @Test
    void mediaResolutionIsValidatedAtStartup() {
        assertThatThrownBy(() -> new SubtitleStudioProperties.Novel(20, null, null, "", 0, "ultra"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("media-resolution");
        assertThat(new SubtitleStudioProperties.Novel(20, null, null, "", 0, null).mediaResolution())
                .isEqualTo("high");
    }

    private static SubtitleStudioProperties.Gemini gemini(String level) {
        return new SubtitleStudioProperties.Gemini("k", MAIN, Duration.ofSeconds(10), Duration.ofMinutes(60),
                Duration.ofMinutes(45), 0.3, List.of(), level);
    }
}
