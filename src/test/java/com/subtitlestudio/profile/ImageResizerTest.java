package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class ImageResizerTest {

    private final ImageResizer resizer = new ImageResizer(new ImageSniffer());

    static byte[] png(int width, int height) {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.ORANGE);
        g.fillRect(0, 0, width, height);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(img, "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    @Test
    void shrinksLongestSideKeepingRatio() throws IOException {
        ImageResizer.Resized r = resizer.resize(png(3000, 2000), 1600);

        assertThat(r.width()).isEqualTo(1600);
        assertThat(r.height()).isEqualTo(1067);
        BufferedImage back = ImageIO.read(new ByteArrayInputStream(r.bytes()));
        assertThat(back.getWidth()).isEqualTo(1600);
        assertThat(back.getHeight()).isEqualTo(1067);
    }

    @Test
    void shrinksPortraitByHeight() {
        ImageResizer.Resized r = resizer.resize(png(2000, 3000), 400);

        assertThat(r.height()).isEqualTo(400);
        assertThat(r.width()).isEqualTo(267);
    }

    @Test
    void neverUpscales() {
        ImageResizer.Resized r = resizer.resize(png(800, 600), 1600);

        assertThat(r.width()).isEqualTo(800);
        assertThat(r.height()).isEqualTo(600);
    }

    @Test
    void rejectsGif() {
        assertThatThrownBy(() -> resizer.resize(ImageSnifferTest.GIF, 400))
                .isInstanceOf(InvalidMediaException.class)
                .hasMessageContaining("cannot be resized");
    }

    @Test
    void rejectsGarbage() {
        assertThatThrownBy(() -> resizer.resize(ImageSnifferTest.ascii("<html>"), 400))
                .isInstanceOf(InvalidMediaException.class);
    }

    @Test
    void outputBytesMatchReportedType() {
        ImageResizer.Resized r = resizer.resize(png(500, 500), 400);

        assertThat(new ImageSniffer().sniff(r.bytes())).contains(r.type());
        assertThat(r.type()).isIn(ImageType.WEBP, ImageType.JPEG);
    }
}
