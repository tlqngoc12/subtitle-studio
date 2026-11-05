package com.subtitlestudio.novel.render;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.profile.ImageSniffer;
import com.subtitlestudio.profile.ImageType;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class ImageEncoderTest {

    private static BufferedImage image() {
        BufferedImage img = new BufferedImage(300, 200, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, 300, 200);
        g.setColor(Color.BLACK);
        g.drawString("Xin chào", 20, 100);
        g.dispose();
        return img;
    }

    private static void roundTrips(ImageEncoder encoder, ImageType expected) throws IOException {
        byte[] bytes = encoder.encode(image());

        assertThat(new ImageSniffer().sniff(bytes)).contains(expected);
        BufferedImage back = ImageIO.read(new ByteArrayInputStream(bytes));
        assertThat(back.getWidth()).isEqualTo(300);
        assertThat(back.getHeight()).isEqualTo(200);
    }

    @Test
    void pngRoundTrips() throws IOException {
        roundTrips(ImageEncoder.png(), ImageType.PNG);
        assertThat(ImageEncoder.png().extension()).isEqualTo("png");
    }

    @Test
    void chosenEncoderMatchesItsExtension() throws IOException {
        ImageEncoder chosen = ImageEncoder.best();

        roundTrips(chosen, chosen.extension().equals("webp") ? ImageType.WEBP : ImageType.PNG);
    }

    @Test
    void webpIsAvailableOnThisPlatform() {
        assertThat(ImageEncoder.best().extension()).isEqualTo("webp");
    }

    @Test
    void webpIsDeterministic() {
        ImageEncoder webp = ImageEncoder.best();

        assertThat(webp.encode(image())).isEqualTo(webp.encode(image()));
    }
}
