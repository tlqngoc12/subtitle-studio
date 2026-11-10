package com.subtitlestudio.ytdlp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class VideoInfoParserTest {

    private final VideoInfoParser parser = new VideoInfoParser();

    @Test
    void parsesMetadataAndManualSubtitleLanguages() {
        VideoInfo info = parser.parse(fixture("ytdlp/info-manual-only.json"));

        assertThat(info.id()).isEqualTo("dQw4w9WgXcQ");
        assertThat(info.title()).isEqualTo("Spring Boot Tutorial: Dependency Injection");
        assertThat(info.channel()).isEqualTo("Dev Channel");
        assertThat(info.durationSec()).isEqualTo(754);
        assertThat(info.subtitleLangs()).containsExactlyInAnyOrder("en", "fr");
        assertThat(info.autoCaptionLangs()).isEmpty();
    }

    @Test
    void parsesDescriptionAndTreatsMissingOrBlankAsNull() {
        String withText = "{\"id\":\"DESC0000001\",\"title\":\"t\",\"description\":\"Cast: Emi\\nBonnie\"}";
        String blank = "{\"id\":\"DESC0000002\",\"title\":\"t\",\"description\":\"   \"}";
        String missing = "{\"id\":\"DESC0000003\",\"title\":\"t\"}";

        assertThat(parser.parse(withText).description()).isEqualTo("Cast: Emi\nBonnie");
        assertThat(parser.parse(blank).description()).isNull();
        assertThat(parser.parse(missing).description()).isNull();
    }

    @Test
    void ignoresLiveChatPseudoSubtitle() {
        VideoInfo info = parser.parse(fixture("ytdlp/info-manual-only.json"));

        assertThat(info.subtitleLangs()).doesNotContain("live_chat");
    }

    @Test
    void parsesAutoCaptionLanguagesAndFractionalDuration() {
        VideoInfo info = parser.parse(fixture("ytdlp/info-auto-only.json"));

        assertThat(info.subtitleLangs()).isEmpty();
        assertThat(info.autoCaptionLangs()).containsExactlyInAnyOrder("en-orig", "en", "vi");
        assertThat(info.durationSec()).isEqualTo(4321);
    }

    @Test
    void fallsBackToUploaderWhenChannelMissingAndAllowsNullDuration() {
        VideoInfo info = parser.parse(fixture("ytdlp/info-no-english.json"));

        assertThat(info.channel()).isEqualTo("Kênh Việt");
        assertThat(info.durationSec()).isNull();
    }

    @Test
    void excludesLanguagesWithNoTracks() {
        VideoInfo info = parser.parse(fixture("ytdlp/info-no-english.json"));

        assertThat(info.autoCaptionLangs()).containsExactly("vi-orig");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"id\":\"dQw4w9WgXcQ\"}",
            "{\"id\":\"dQw4w9WgXcQ\",\"title\":\"\"}",
            "{\"id\":\"dQw4w9WgXcQ\",\"title\":\"   \"}"})
    void usesVideoIdWhenTitleIsMissingOrBlank(String json) {
        assertThat(parser.parse(json).title()).isEqualTo("dQw4w9WgXcQ");
    }

    @Test
    void treatsMissingSubtitleObjectsAsEmpty() {
        VideoInfo info = parser.parse("{\"id\":\"dQw4w9WgXcQ\",\"title\":\"t\"}");

        assertThat(info.subtitleLangs()).isEmpty();
        assertThat(info.autoCaptionLangs()).isEmpty();
        assertThat(info.channel()).isNull();
        assertThat(info.durationSec()).isNull();
    }

    @Test
    void rejectsMalformedJson() {
        assertThatThrownBy(() -> parser.parse("WARNING: something {not json"))
                .isInstanceOf(YtDlpFailedException.class);
    }

    @Test
    void rejectsJsonWithoutId() {
        assertThatThrownBy(() -> parser.parse("{\"title\":\"no id\"}"))
                .isInstanceOf(YtDlpFailedException.class);
    }

    private static String fixture(String path) {
        try (InputStream in = VideoInfoParserTest.class.getClassLoader().getResourceAsStream(path)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
