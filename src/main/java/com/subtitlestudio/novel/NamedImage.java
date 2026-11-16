package com.subtitlestudio.novel;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Arrays;
import org.springframework.web.multipart.MultipartFile;

/**
 * An uploaded screenshot: the user's file name (for ordering) and its content. The content can be read lazily, so a
 * request with many large files never holds more than one file's bytes at a time: validation uses {@link #size()}
 * and {@link #head(int)}, and only the store step calls {@link #bytes()}.
 */
public record NamedImage(String name, Content content) {

    /** Where the bytes come from; {@code bytes()} may read a file or temp file, so call it once per file. */
    public interface Content {
        long size();

        /** The first {@code n} bytes (fewer if the file is shorter). */
        byte[] head(int n);

        /** The whole file. */
        byte[] bytes();
    }

    /** An image already in memory. */
    public NamedImage(String name, byte[] bytes) {
        this(name, new InMemory(bytes));
    }

    /** An image read from the upload only when {@link #head(int)} or {@link #bytes()} is called. */
    public static NamedImage of(MultipartFile file) {
        return new NamedImage(file.getOriginalFilename(), new Uploaded(file));
    }

    public long size() {
        return content.size();
    }

    public byte[] head(int n) {
        return content.head(n);
    }

    public byte[] bytes() {
        return content.bytes();
    }

    private record InMemory(byte[] data) implements Content {
        @Override
        public long size() {
            return data.length;
        }

        @Override
        public byte[] head(int n) {
            return Arrays.copyOf(data, Math.min(n, data.length));
        }

        @Override
        public byte[] bytes() {
            return data;
        }
    }

    private record Uploaded(MultipartFile file) implements Content {
        @Override
        public long size() {
            return file.getSize();
        }

        @Override
        public byte[] head(int n) {
            try (InputStream in = file.getInputStream()) {
                return in.readNBytes(n);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }

        @Override
        public byte[] bytes() {
            try {
                return file.getBytes();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }
}
