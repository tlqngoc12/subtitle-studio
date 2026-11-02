package com.subtitlestudio.subtitle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class VttParserTest {

    private final VttParser parser = new VttParser();

    @Test
    void parsesManualSampleWithHeaderMetadataAndOptionalIdentifiers() {
        List<RawCue> cues = parser.parse(fixture("vtt/manual.vtt"));

        assertThat(cues).containsExactly(
                new RawCue(1_000, 3_500, List.of("Welcome back to the channel.")),
                new RawCue(3_500, 6_250, List.of("Today we're talking about", "dependency injection in Spring.")),
                new RawCue(7_000, 9_000, List.of("No identifier on this one.")));
    }

    @Test
    void skipsNoteStyleAndRegionBlocks() {
        String vtt = """
                WEBVTT

                NOTE This is a one-line comment

                STYLE
                ::cue { color: yellow; }

                REGION
                id:bill width:40%

                NOTE
                multi-line comment
                00:00:09.000 --> 00:00:10.000 should not be parsed as a cue

                00:00:01.000 --> 00:00:02.000
                real cue
                """;

        assertThat(parser.parse(vtt)).containsExactly(new RawCue(1_000, 2_000, List.of("real cue")));
    }

    @Test
    void acceptsHeaderWithTrailingTitle() {
        String vtt = """
                WEBVTT - Some title

                00:00:01.000 --> 00:00:02.000
                hello
                """;

        assertThat(parser.parse(vtt)).containsExactly(new RawCue(1_000, 2_000, List.of("hello")));
    }

    @Test
    void parsesShortAndLongTimestampForms() {
        String vtt = """
                WEBVTT

                01:05.250 --> 01:07.000
                minutes only

                01:02:03.456 --> 123:00:00.001
                hours, including more than two digits
                """;

        assertThat(parser.parse(vtt)).extracting(RawCue::startMs, RawCue::endMs).containsExactly(
                org.assertj.core.groups.Tuple.tuple(65_250L, 67_000L),
                org.assertj.core.groups.Tuple.tuple(3_723_456L, 442_800_001L));
    }

    @Test
    void ignoresCueSettingsAfterTimestamp() {
        String vtt = """
                WEBVTT

                00:00:01.000 --> 00:00:02.000 align:start position:0% line:90%
                text
                """;

        assertThat(parser.parse(vtt)).containsExactly(new RawCue(1_000, 2_000, List.of("text")));
    }

    @Test
    void removesInlineTimestampAndStyleTags() {
        String vtt = """
                WEBVTT

                00:00:01.000 --> 00:00:03.000
                so<00:00:01.400><c> today</c><00:00:01.800><c.colorE5E5E5> we're</c>
                <i>italic</i> and <b>bold</b> and <v Roger>voice</v>
                """;

        assertThat(parser.parse(vtt)).containsExactly(
                new RawCue(1_000, 3_000, List.of("so today we're", "italic and bold and voice")));
    }

    @Test
    void decodesHtmlEntitiesAfterStrippingTags() {
        String vtt = """
                WEBVTT

                00:00:01.000 --> 00:00:02.000
                Tom &amp; Jerry &lt;3 it&#39;s &quot;fine&quot;&nbsp;ok
                &lt;i&gt;not a tag&lt;/i&gt;
                """;

        assertThat(parser.parse(vtt)).containsExactly(new RawCue(1_000, 2_000,
                List.of("Tom & Jerry <3 it's \"fine\" ok", "<i>not a tag</i>")));
    }

    @Test
    void handlesCrlfLineEndingsAndUtf8Bom() {
        String vtt = "﻿WEBVTT\r\nKind: captions\r\n\r\n"
                + "00:00:01.000 --> 00:00:02.000\r\nline one\r\nline two\r\n\r\n"
                + "00:00:03.000 --> 00:00:04.000\r\nnext\r\n";

        assertThat(parser.parse(vtt)).containsExactly(
                new RawCue(1_000, 2_000, List.of("line one", "line two")),
                new RawCue(3_000, 4_000, List.of("next")));
    }

    @Test
    void toleratesMultipleBlankLinesBetweenCues() {
        String vtt = "WEBVTT\n\n\n\n00:00:01.000 --> 00:00:02.000\na\n\n\n\n00:00:03.000 --> 00:00:04.000\nb\n";

        assertThat(parser.parse(vtt)).extracting(RawCue::lines)
                .containsExactly(List.of("a"), List.of("b"));
    }

    @Test
    void dropsWhitespaceOnlyLinesAndCuesWithoutText() {
        String vtt = "WEBVTT\n\n"
                + "00:00:01.000 --> 00:00:02.000\n \nkept\n\n"
                + "00:00:02.000 --> 00:00:03.000\n<c> </c>\n";

        assertThat(parser.parse(vtt)).containsExactly(new RawCue(1_000, 2_000, List.of("kept")));
    }

    @Test
    void skipsBlockWithoutTimingLine() {
        String vtt = """
                WEBVTT

                just some stray text

                00:00:01.000 --> 00:00:02.000
                ok
                """;

        assertThat(parser.parse(vtt)).containsExactly(new RawCue(1_000, 2_000, List.of("ok")));
    }

    @Test
    void parsesAutoRollingSampleKeepingDuplicatesForNormalizer() {
        List<RawCue> cues = parser.parse(fixture("vtt/auto-rolling.vtt"));

        assertThat(cues).containsExactly(
                new RawCue(1_000, 3_500, List.of("so today we're going to talk")),
                new RawCue(3_500, 3_510, List.of("so today we're going to talk")),
                new RawCue(3_510, 6_000, List.of("so today we're going to talk", "about dependency injection in spring")),
                new RawCue(6_000, 6_010, List.of("about dependency injection in spring")),
                new RawCue(6_010, 8_500, List.of("about dependency injection in spring", "and why it matters")));
    }

    @Test
    void rejectsContentWithoutWebvttHeader() {
        assertThatThrownBy(() -> parser.parse("00:00:01.000 --> 00:00:02.000\nhello\n"))
                .isInstanceOf(VttParseException.class);
    }

    @Test
    void rejectsNullOrEmptyContent() {
        assertThatThrownBy(() -> parser.parse(null)).isInstanceOf(VttParseException.class);
        assertThatThrownBy(() -> parser.parse("")).isInstanceOf(VttParseException.class);
    }

    @Test
    void returnsEmptyListForHeaderOnlyFile() {
        assertThat(parser.parse("WEBVTT\n")).isEmpty();
    }

    private static String fixture(String path) {
        try (InputStream in = VttParserTest.class.getClassLoader().getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("Missing fixture: " + path);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
