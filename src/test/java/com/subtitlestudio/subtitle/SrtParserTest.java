package com.subtitlestudio.subtitle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class SrtParserTest {

    private final SrtParser parser = new SrtParser();

    private static byte[] utf8(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void parsesBlocksWithCrlfAndBom() {
        SrtParseResult r = parser.parse(utf8("﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nXin chào\r\n\r\n"
                + "2\r\n00:00:03,000 --> 00:00:04,000\r\nTạm biệt\r\n"));

        assertThat(r.entries()).containsExactly(
                new SrtEntry(1, 1_000, 2_500, "Xin chào"),
                new SrtEntry(2, 3_000, 4_000, "Tạm biệt"));
        assertThat(r.skippedBlocks()).isZero();
    }

    @Test
    void acceptsLfAndCrOnlyLineEndings() {
        String lf = "1\n00:00:01,000 --> 00:00:02,000\na\n\n2\n00:00:03,000 --> 00:00:04,000\nb\n";

        assertThat(parser.parse(utf8(lf)).entries()).hasSize(2);
        assertThat(parser.parse(utf8(lf.replace('\n', '\r'))).entries()).hasSize(2);
    }

    @Test
    void acceptsDotAsMillisecondSeparator() {
        assertThat(parser.parse(utf8("1\n00:00:01.000 --> 00:00:02.000\na\n")).entries().get(0).startMs())
                .isEqualTo(1_000);
    }

    @Test
    void acceptsHoursAboveTwoDigits() {
        assertThat(parser.parse(utf8("1\n100:00:00,000 --> 100:00:01,000\na\n")).entries().get(0).startMs())
                .isEqualTo(360_000_000L);
    }

    @Test
    void joinsMultiLineTextWithNewline() {
        assertThat(parser.parse(utf8("1\n00:00:01,000 --> 00:00:02,000\n  dòng một \n dòng hai\n")).entries().get(0).text())
                .isEqualTo("dòng một\ndòng hai");
    }

    @Test
    void dropsEmptyTextLines() {
        assertThat(parser.parse(utf8("1\n00:00:01,000 --> 00:00:02,000\n   \nchữ\n")).entries().get(0).text())
                .isEqualTo("chữ");
    }

    @Test
    void usesPositionWhenIndexLineMissing() {
        SrtParseResult r = parser.parse(utf8("00:00:01,000 --> 00:00:02,000\na\n\n00:00:03,000 --> 00:00:04,000\nb\n"));

        assertThat(r.entries()).extracting(SrtEntry::index).containsExactly(1, 2);
    }

    @Test
    void toleratesExtraBlankLinesAndMissingTrailingNewline() {
        SrtParseResult r = parser.parse(utf8("\n\n1\n00:00:01,000 --> 00:00:02,000\na\n\n\n\n2\n00:00:03,000 --> 00:00:04,000\nb"));

        assertThat(r.entries()).extracting(SrtEntry::text).containsExactly("a", "b");
    }

    @Test
    void skipsBlocksWithoutValidTiming() {
        SrtParseResult r = parser.parse(utf8("1\n00:00:01,000 --> 00:00:02,000\na\n\n"
                + "2\nnot a timing line\nb\n\n"
                + "3\n00:00:05,000 --> 00:00:06,000\nc\n"));

        assertThat(r.entries()).hasSize(2);
        assertThat(r.skippedBlocks()).isEqualTo(1);
    }

    @Test
    void splitsBlocksMissingTheBlankLineBetweenThem() {
        SrtParseResult r = parser.parse(utf8("1\n00:00:01,000 --> 00:00:02,000\nmột\n"
                + "2\n00:00:03,000 --> 00:00:04,000\nhai\n"));

        assertThat(r.entries()).containsExactly(
                new SrtEntry(1, 1_000, 2_000, "một"),
                new SrtEntry(2, 3_000, 4_000, "hai"));
    }

    @Test
    void splitsBlocksMissingBothBlankLineAndIndex() {
        SrtParseResult r = parser.parse(utf8("00:00:01,000 --> 00:00:02,000\nmột\n00:00:03,000 --> 00:00:04,000\nhai\n"));

        assertThat(r.entries()).extracting(SrtEntry::text).containsExactly("một", "hai");
        assertThat(r.entries()).extracting(SrtEntry::startMs).containsExactly(1_000L, 3_000L);
    }

    @Test
    void keepsMarkupAsIs() {
        assertThat(parser.parse(utf8("1\n00:00:01,000 --> 00:00:02,000\n<i>nghiêng</i>\n")).entries().get(0).text())
                .isEqualTo("<i>nghiêng</i>");
    }

    @Test
    void rejectsFileWithNoReadableBlock() {
        assertThatThrownBy(() -> parser.parse(utf8("hello\nworld"))).isInstanceOf(InvalidSrtException.class);
    }

    @Test
    void rejectsEmptyContent() {
        assertThatThrownBy(() -> parser.parse(new byte[0])).isInstanceOf(InvalidSrtException.class);
    }

    @Test
    void rejectsUtf16File() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(0xFF);
        out.write(0xFE);
        out.writeBytes("1\r\n00:00:01,000 --> 00:00:02,000\r\nXin chào\r\n".getBytes(StandardCharsets.UTF_16LE));

        assertThatThrownBy(() -> parser.parse(out.toByteArray()))
                .isInstanceOf(InvalidSrtException.class)
                .hasMessageContaining("UTF-8");
    }

    @Test
    void rejectsInvalidUtf8Bytes() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(utf8("1\n00:00:01,000 --> 00:00:02,000\n"));
        out.write(0xC3);
        out.write(0x28);

        assertThatThrownBy(() -> parser.parse(out.toByteArray())).isInstanceOf(InvalidSrtException.class);
    }
}
