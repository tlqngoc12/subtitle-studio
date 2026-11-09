package com.subtitlestudio.novel;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/** Reads an image's size from its header, without decoding the pixels. */
public final class PageImageSize {

    private PageImageSize() {
    }

    /** True when the image is wider than it is tall; false when it is not, or cannot be read. */
    public static boolean landscape(Path image) {
        try (ImageInputStream in = ImageIO.createImageInputStream(image.toFile())) {
            if (in == null) {
                return false;
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            while (readers.hasNext()) {
                ImageReader reader = readers.next();
                try {
                    reader.setInput(in, true, true);
                    return reader.getWidth(0) > reader.getHeight(0);
                } catch (IOException | RuntimeException e) {
                    in.seek(0);
                } finally {
                    reader.dispose();
                }
            }
            return false;
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }
}
