package com.subtitlestudio.novel.render;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;

/** Turns a drawn page into file bytes: lossless WebP when the platform has it, PNG otherwise. */
public interface ImageEncoder {

    byte[] encode(BufferedImage image);

    /** File extension without the dot: {@code webp} or {@code png}. */
    String extension();

    static ImageEncoder png() {
        return new ImageEncoder() {
            @Override
            public byte[] encode(BufferedImage image) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                try {
                    ImageIO.write(image, "png", out);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                }
                return out.toByteArray();
            }

            @Override
            public String extension() {
                return "png";
            }
        };
    }

    /** Lossless WebP if an ImageIO writer for it loads and keeps transparency here (native library), else PNG. */
    static ImageEncoder best() {
        ImageEncoder webp = new ImageEncoder() {
            @Override
            public byte[] encode(BufferedImage image) {
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
                    String lossless = Arrays.stream(param.getCompressionTypes())
                            .filter(t -> t.toLowerCase().contains("lossless")).findFirst()
                            .orElseThrow(() -> new IllegalStateException("No lossless WebP"));
                    param.setCompressionType(lossless);
                    writer.write(null, new IIOImage(image, null, null), param);
                } catch (IOException e) {
                    throw new UncheckedIOException(e);
                } finally {
                    writer.dispose();
                }
                return bytes.toByteArray();
            }

            @Override
            public String extension() {
                return "webp";
            }
        };
        return pick(webp);
    }

    /** The given WebP encoder if it round-trips a transparent pixel here, else PNG. */
    static ImageEncoder pick(ImageEncoder webp) {
        try {
            BufferedImage probe = new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB);
            probe.setRGB(1, 1, 0xFF000000);
            BufferedImage back = ImageIO.read(new ByteArrayInputStream(webp.encode(probe)));
            if (back != null && back.getColorModel().hasAlpha() && (back.getRGB(0, 0) >>> 24) == 0) {
                return webp;
            }
            return png();
        } catch (IOException | RuntimeException | LinkageError e) {
            return png();
        }
    }
}
