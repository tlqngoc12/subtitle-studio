package com.subtitlestudio.novel;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import javax.imageio.ImageIO;

/** Real, decodable images for novel tests. */
final class TestImages {

    private TestImages() {
    }

    static byte[] png() {
        return png(4, 4, false);
    }

    static byte[] png(int width, int height, boolean alpha) {
        BufferedImage img = new BufferedImage(width, height,
                alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(alpha ? new Color(0, 0, 0, 0) : Color.WHITE);
        g.fillRect(0, 0, width, height);
        g.setColor(Color.BLACK);
        g.fillRect(0, 0, Math.max(1, width / 4), Math.max(1, height / 4));
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(img, "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    /** A white image with a red 40x40 block at the top-left corner, as a JPEG. */
    static byte[] jpeg(int width, int height) {
        return encode(corner(width, height), "jpg");
    }

    /** Same picture as {@link #jpeg}, as a PNG. */
    static byte[] cornerPng(int width, int height) {
        return encode(corner(width, height), "png");
    }

    private static BufferedImage corner(int width, int height) {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, width, height);
        g.setColor(Color.RED);
        g.fillRect(0, 0, 40, 40);
        g.dispose();
        return img;
    }

    private static byte[] encode(BufferedImage img, String format) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            ImageIO.write(img, format, out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }
}
