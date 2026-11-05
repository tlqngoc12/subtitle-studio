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

class PageImagePreparerTest {

    @TempDir
    Path dir;

    private final PageImagePreparer preparer = new PageImagePreparer();

    private BufferedImage prepare(byte[] png) throws IOException {
        Path file = dir.resolve("in.png");
        Files.write(file, png);
        byte[] jpeg = preparer.prepare(file);
        assertThat(jpeg[0] & 0xff).isEqualTo(0xFF);
        assertThat(jpeg[1] & 0xff).isEqualTo(0xD8);
        return ImageIO.read(new ByteArrayInputStream(jpeg));
    }

    @Test
    void shrinksLongSideTo2000AndKeepsRatio() throws IOException {
        BufferedImage out = prepare(TestImages.png(3000, 6000, true));

        assertThat(out.getHeight()).isEqualTo(2000);
        assertThat(out.getWidth()).isEqualTo(1000);
    }

    @Test
    void keepsSmallImagesAtTheirSize() throws IOException {
        BufferedImage out = prepare(TestImages.png(800, 600, false));

        assertThat(out.getWidth()).isEqualTo(800);
        assertThat(out.getHeight()).isEqualTo(600);
    }

    @Test
    void transparentAreasBecomeWhite() throws IOException {
        BufferedImage out = prepare(TestImages.png(400, 400, true));

        int rgb = out.getRGB(399, 399) & 0xFFFFFF;
        assertThat((rgb >> 16) & 0xFF).isGreaterThan(240);
    }
}
