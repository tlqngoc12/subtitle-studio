package com.subtitlestudio.novel;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Path;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import org.springframework.stereotype.Component;

/**
 * Makes a screenshot small enough for Gemini: long side at most 2,000 px (never enlarged), white behind transparency,
 * JPEG quality 0.85. Text stays sharp enough to read.
 */
@Component
public class PageImagePreparer {

    static final int MAX_SIDE = 2_000;
    static final float QUALITY = 0.85f;

    public byte[] prepare(Path image) {
        try {
            BufferedImage in = ImageIO.read(image.toFile());
            if (in == null) {
                throw new IOException("Unsupported image: " + image.getFileName());
            }
            double scale = Math.min(1.0, (double) MAX_SIDE / Math.max(in.getWidth(), in.getHeight()));
            int w = Math.max(1, (int) Math.round(in.getWidth() * scale));
            int h = Math.max(1, (int) Math.round(in.getHeight() * scale));
            BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = out.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, w, h);
            g.drawImage(in, 0, 0, w, h, null);
            g.dispose();
            return jpeg(out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static byte[] jpeg(BufferedImage img) throws IOException {
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
