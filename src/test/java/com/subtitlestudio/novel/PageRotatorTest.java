package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PageRotatorTest {

    @TempDir
    Path dir;

    private final PageRotator rotator = new PageRotator();

    private Path file(String name, byte[] bytes) throws IOException {
        return Files.write(dir.resolve(name), bytes);
    }

    private static BufferedImage decode(byte[] bytes) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(bytes));
    }

    private static boolean isRed(BufferedImage img, int x, int y) {
        int rgb = img.getRGB(x, y);
        int r = (rgb >> 16) & 0xff;
        int g = (rgb >> 8) & 0xff;
        int b = rgb & 0xff;
        return r > 180 && g < 100 && b < 100;
    }

    @Test
    void rotatesJpegRightSwappingSides() throws IOException {
        Path in = file("a.jpg", TestImages.jpeg(300, 200));

        BufferedImage right = decode(rotator.rotate(in, RotateDirection.RIGHT));
        BufferedImage left = decode(rotator.rotate(in, RotateDirection.LEFT));

        assertThat(right.getWidth()).isEqualTo(200);
        assertThat(right.getHeight()).isEqualTo(300);
        assertThat(isRed(right, 190, 10)).isTrue();
        assertThat(isRed(right, 10, 10)).isFalse();
        assertThat(left.getWidth()).isEqualTo(200);
        assertThat(left.getHeight()).isEqualTo(300);
        assertThat(isRed(left, 10, 290)).isTrue();
        assertThat(isRed(left, 10, 10)).isFalse();
    }

    @Test
    void pngStaysPng() throws IOException {
        Path in = file("a.png", TestImages.cornerPng(300, 200));

        byte[] out = rotator.rotate(in, RotateDirection.RIGHT);

        assertThat(out).startsWith((byte) 0x89, (byte) 'P', (byte) 'N', (byte) 'G');
        BufferedImage img = decode(out);
        assertThat(img.getWidth()).isEqualTo(200);
        assertThat(isRed(img, 190, 10)).isTrue();
    }

    @Test
    void landscapeComesFromTheHeaderOnly() throws IOException {
        assertThat(PageImageSize.landscape(file("w.jpg", TestImages.jpeg(300, 200)))).isTrue();
        assertThat(PageImageSize.landscape(file("t.png", TestImages.cornerPng(200, 300)))).isFalse();
        assertThat(PageImageSize.landscape(file("bad.png", new byte[] {1, 2, 3}))).isFalse();
        assertThat(PageImageSize.landscape(dir.resolve("missing.png"))).isFalse();
    }
}
