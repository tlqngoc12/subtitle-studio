package com.subtitlestudio.novel;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import org.springframework.stereotype.Component;

/**
 * Turns a page photo by 90 degrees. PNG stays PNG; JPEG and WebP come out as JPEG (quality 0.92), which the app
 * serves and Gemini reads the same way.
 */
@Component
public class PageRotator {

    static final float QUALITY = 0.92f;
    private static final byte[] PNG_SIGNATURE = {(byte) 0x89, 'P', 'N', 'G'};

    public byte[] rotate(Path image, RotateDirection direction) {
        try {
            byte[] head = new byte[PNG_SIGNATURE.length];
            boolean png;
            try (var in = Files.newInputStream(image)) {
                png = in.readNBytes(head, 0, head.length) == head.length && java.util.Arrays.equals(head, PNG_SIGNATURE);
            }
            BufferedImage in = ImageIO.read(image.toFile());
            if (in == null) {
                throw new IOException("Unsupported image: " + image.getFileName());
            }
            int w = in.getWidth();
            int h = in.getHeight();
            BufferedImage out = new BufferedImage(h, w, png ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
            Graphics2D g = out.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
            if (!png) {
                g.setColor(Color.WHITE);
                g.fillRect(0, 0, h, w);
            }
            if (direction == RotateDirection.RIGHT) {
                g.translate(h, 0);
                g.rotate(Math.PI / 2);
            } else {
                g.translate(0, w);
                g.rotate(-Math.PI / 2);
            }
            g.drawImage(in, 0, 0, null);
            g.dispose();
            return png ? encodePng(out) : encodeJpeg(out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static byte[] encodePng(BufferedImage img) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        if (!ImageIO.write(img, "png", bytes)) {
            throw new IOException("No PNG writer");
        }
        return bytes.toByteArray();
    }

    private static byte[] encodeJpeg(BufferedImage img) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ImageOutputStream out = ImageIO.createImageOutputStream(bytes)) {
            writer.setOutput(out);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(QUALITY);
            writer.write(null, new IIOImage(img, null, null), param);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }
}
