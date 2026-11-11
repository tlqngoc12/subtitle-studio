package com.subtitlestudio.profile;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import org.springframework.stereotype.Component;

/**
 * Shrinks an uploaded JPEG/PNG/WebP so its longest side is at most {@code maxSide} (never upscales) and re-encodes it
 * as lossy WebP (quality 0.82), or JPEG (0.85) when this platform has no WebP writer.
 */
@Component
public class ImageResizer {

    static final float WEBP_QUALITY = 0.82f;
    static final float JPEG_QUALITY = 0.85f;
    private static final long MAX_PIXELS = 50_000_000L;

    public record Resized(byte[] bytes, ImageType type, int width, int height) {}

    private final ImageSniffer sniffer;

    public ImageResizer(ImageSniffer sniffer) {
        this.sniffer = sniffer;
    }

    public Resized resize(byte[] bytes, int maxSide) {
        ImageType type = sniffer.sniff(bytes)
                .orElseThrow(() -> new InvalidMediaException("Not a JPEG, PNG, WebP or GIF image"));
        if (type == ImageType.GIF) {
            throw new InvalidMediaException("Animated or GIF images cannot be resized");
        }
        BufferedImage source = decode(bytes);
        int w = source.getWidth();
        int h = source.getHeight();
        int longest = Math.max(w, h);
        int tw = w;
        int th = h;
        if (longest > maxSide) {
            double scale = (double) maxSide / longest;
            tw = Math.max(1, (int) Math.round(w * scale));
            th = Math.max(1, (int) Math.round(h * scale));
        }
        BufferedImage target = scale(source, tw, th);
        try {
            return new Resized(encodeWebp(target), ImageType.WEBP, tw, th);
        } catch (IOException | RuntimeException | LinkageError e) {
            return new Resized(encodeJpeg(target), ImageType.JPEG, tw, th);
        }
    }

    private static BufferedImage decode(byte[] bytes) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw new InvalidMediaException("The image cannot be read");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                if ((long) reader.getWidth(0) * reader.getHeight(0) > MAX_PIXELS) {
                    throw new InvalidMediaException("The image has too many pixels");
                }
                return reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof InvalidMediaException ime) {
                throw ime;
            }
            throw new InvalidMediaException("The image cannot be read");
        }
    }

    /** Halves while the step is more than twice the target, so large downscales stay sharp. */
    private static BufferedImage scale(BufferedImage src, int tw, int th) {
        BufferedImage current = src;
        int w = src.getWidth();
        int h = src.getHeight();
        while (w / 2 >= tw && h / 2 >= th) {
            w /= 2;
            h /= 2;
            current = draw(current, w, h);
        }
        return (w == tw && h == th && current != src) ? current : draw(current, tw, th);
    }

    private static BufferedImage draw(BufferedImage src, int w, int h) {
        BufferedImage out = new BufferedImage(w, h, src.getColorModel().hasAlpha()
                ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(src, 0, 0, w, h, null);
        g.dispose();
        return out;
    }

    private static byte[] encodeWebp(BufferedImage image) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByMIMEType("image/webp");
        if (!writers.hasNext()) {
            throw new IllegalStateException("No WebP writer");
        }
        ImageWriter writer = writers.next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ImageOutputStream out = ImageIO.createImageOutputStream(bytes)) {
            writer.setOutput(out);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            String lossy = Arrays.stream(param.getCompressionTypes())
                    .filter(t -> t.toLowerCase().contains("lossy")).findFirst()
                    .orElseThrow(() -> new IllegalStateException("No lossy WebP"));
            param.setCompressionType(lossy);
            param.setCompressionQuality(WEBP_QUALITY);
            writer.write(null, new IIOImage(image, null, null), param);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }

    private static byte[] encodeJpeg(BufferedImage image) {
        BufferedImage rgb = new BufferedImage(image.getWidth(), image.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = rgb.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, rgb.getWidth(), rgb.getHeight());
        g.drawImage(image, 0, 0, null);
        g.dispose();
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ImageOutputStream out = ImageIO.createImageOutputStream(bytes)) {
            writer.setOutput(out);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);
            writer.write(null, new IIOImage(rgb, null, null), param);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } finally {
            writer.dispose();
        }
        return bytes.toByteArray();
    }
}
