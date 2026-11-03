package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class ImageSnifferTest {

    private final ImageSniffer sniffer = new ImageSniffer();

    static byte[] bytes(int... values) {
        byte[] b = new byte[values.length];
        for (int i = 0; i < values.length; i++) {
            b[i] = (byte) values[i];
        }
        return b;
    }

    static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.ISO_8859_1);
    }

    /** Smallest headers that identify each format, followed by some payload. */
    static final byte[] JPEG = bytes(0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10);
    static final byte[] PNG = bytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00);
    static final byte[] GIF = ascii("GIF89a\u0001\u0000");
    static final byte[] WEBP = ascii("RIFF\u0010\u0000\u0000\u0000WEBPVP8 ");

    static Stream<Arguments> images() {
        return Stream.of(
                Arguments.of(JPEG, ImageType.JPEG),
                Arguments.of(PNG, ImageType.PNG),
                Arguments.of(GIF, ImageType.GIF),
                Arguments.of(ascii("GIF87a\u0001\u0000"), ImageType.GIF),
                Arguments.of(WEBP, ImageType.WEBP));
    }

    @ParameterizedTest
    @MethodSource("images")
    void recognisesImageHeaders(byte[] data, ImageType expected) {
        assertThat(sniffer.sniff(data)).contains(expected);
    }

    @Test
    void rejectsHtmlRenamedToJpg() {
        assertThat(sniffer.sniff(ascii("<html><script>alert(1)</script>"))).isEmpty();
    }

    @Test
    void rejectsEmptyAndTooShort() {
        assertThat(sniffer.sniff(new byte[0])).isEmpty();
        assertThat(sniffer.sniff(bytes(0xFF, 0xD8))).isEmpty();
    }

    @Test
    void rejectsOtherRiffFormats() {
        assertThat(sniffer.sniff(ascii("RIFF\u0010\u0000\u0000\u0000WAVEfmt "))).isEmpty();
    }

    @Test
    void typesKnowTheirContentTypeAndExtension() {
        assertThat(ImageType.JPEG.contentType()).isEqualTo("image/jpeg");
        assertThat(ImageType.JPEG.extension()).isEqualTo("jpg");
        assertThat(ImageType.WEBP.contentType()).isEqualTo("image/webp");
    }
}
