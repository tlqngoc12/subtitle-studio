package com.subtitlestudio.novel.render;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RenderCacheTest {

    @TempDir
    Path dir;

    private RenderCache cache() {
        return new RenderCache(dir, new NovelRenderer(SubtitleStudioProperties.Novel.Render.defaults()),
                ImageEncoder.png());
    }

    private static RenderInput input(String text) {
        return new RenderInput("Tình Yêu", 1, null, text, "example.pages.dev");
    }

    private List<Path> filesIn(long chapterId) throws IOException {
        try (Stream<Path> files = Files.list(dir.resolve(String.valueOf(chapterId)))) {
            return files.filter(f -> f.toString().endsWith(".png")).sorted().toList();
        }
    }

    @Test
    void reusesFilesForSameInput() throws IOException {
        RenderCache cache = cache();
        List<Path> first = cache.imagesFor(7, input("Xin chào"));
        FileTime written = FileTime.fromMillis(1_000);
        Files.setLastModifiedTime(first.getFirst(), written);

        List<Path> second = cache.imagesFor(7, input("Xin chào"));

        assertThat(second).isEqualTo(first);
        assertThat(Files.getLastModifiedTime(second.getFirst())).isEqualTo(written);
        assertThat(first.getFirst().getFileName().toString()).matches("[0-9a-f]{16}-1\\.png");
    }

    @Test
    void newTextReplacesOldFiles() throws IOException {
        RenderCache cache = cache();
        List<Path> old = cache.imagesFor(7, input("Xin chào"));

        List<Path> fresh = cache.imagesFor(7, input("Tạm biệt"));

        assertThat(fresh).doesNotContainAnyElementsOf(old);
        assertThat(filesIn(7)).containsExactlyElementsOf(fresh);
    }

    @Test
    void evictDeletesTheChapterFolder() {
        RenderCache cache = cache();
        cache.imagesFor(7, input("Xin chào"));

        cache.evict(7);
        cache.evict(8);

        assertThat(dir.resolve("7")).doesNotExist();
    }
}
