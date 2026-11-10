package com.subtitlestudio.novel.render;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Stream;

/**
 * Chapter images on disk: {@code {dir}/{chapterId}/{hash}-{k}.{ext}}, where the hash covers everything that changes
 * the pixels. Unchanged chapters are not drawn again (and wrangler does not upload them again); a new hash replaces
 * the chapter's old files. Every {@link PageFormat} has its own hash; {@code {hash}.count} is written last and marks
 * a complete set of that format.
 */
public class RenderCache {

    private final Path dir;
    private final NovelRenderer renderer;
    private final ImageEncoder encoder;

    public RenderCache(Path dir, NovelRenderer renderer, ImageEncoder encoder) {
        this.dir = dir;
        this.renderer = renderer;
        this.encoder = encoder;
    }

    /**
     * The chapter's images in every {@link PageFormat#ALL} format, in that order. Each format has its own hash, so a
     * missing file redraws only its format.
     */
    public synchronized List<RenderedFormat> imagesFor(long chapterId, RenderInput input) {
        Path chapterDir = dir.resolve(String.valueOf(chapterId));
        try {
            Files.createDirectories(chapterDir);
            List<RenderedFormat> result = new ArrayList<>();
            List<String> hashes = new ArrayList<>();
            for (PageFormat format : PageFormat.ALL) {
                String hash = hash(input, format);
                hashes.add(hash);
                result.add(new RenderedFormat(format, formatFiles(chapterDir, hash, format, input)));
            }
            deleteOthers(chapterDir, hashes);
            return result;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private List<Path> formatFiles(Path chapterDir, String hash, PageFormat format, RenderInput input)
            throws IOException {
        Path count = chapterDir.resolve(hash + ".count");
        if (Files.isRegularFile(count)) {
            List<Path> files = files(chapterDir, hash, Integer.parseInt(Files.readString(count).strip()));
            if (files.stream().allMatch(Files::isRegularFile)) {
                return files;
            }
        }
        List<BufferedImage> images = renderer.render(input, format);
        List<Path> files = files(chapterDir, hash, images.size());
        for (int i = 0; i < images.size(); i++) {
            Path tmp = chapterDir.resolve(files.get(i).getFileName() + ".tmp");
            Files.write(tmp, encoder.encode(images.get(i)));
            Files.move(tmp, files.get(i), StandardCopyOption.REPLACE_EXISTING);
        }
        Files.writeString(count, String.valueOf(images.size()));
        return files;
    }

    /** Deletes a chapter's images (chapter or novel deleted). */
    public synchronized void evict(long chapterId) {
        Path chapterDir = dir.resolve(String.valueOf(chapterId));
        if (!Files.isDirectory(chapterDir)) {
            return;
        }
        try (Stream<Path> files = Files.walk(chapterDir)) {
            for (Path p : files.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(p);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private List<Path> files(Path chapterDir, String hash, int n) {
        List<Path> files = new ArrayList<>();
        for (int k = 1; k <= n; k++) {
            files.add(chapterDir.resolve(hash + "-" + k + "." + encoder.extension()));
        }
        return files;
    }

    private static void deleteOthers(Path chapterDir, List<String> hashes) throws IOException {
        try (Stream<Path> files = Files.list(chapterDir)) {
            for (Path p : files.toList()) {
                if (hashes.stream().noneMatch(p.getFileName().toString()::startsWith)) {
                    Files.deleteIfExists(p);
                }
            }
        }
    }

    private String hash(RenderInput in, PageFormat format) {
        String key = String.join("\u0000", "v" + NovelRenderer.VERSION, encoder.extension(),
                format.key(), String.valueOf(format.width()), String.valueOf(format.height()),
                String.valueOf(format.margin()), String.valueOf(renderer.fontSize()),
                String.valueOf(in.watermark()), String.valueOf(in.novelTitle()), String.valueOf(in.chapterNo()),
                String.valueOf(in.chapterTitle()), String.valueOf(in.text()));
        if (in.hasLabel()) {
            key += "\u0000label:" + in.chapterLabel(); // unlabelled chapters keep their cached images
        }
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest).substring(0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
