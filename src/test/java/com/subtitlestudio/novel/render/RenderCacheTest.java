package com.subtitlestudio.novel.render;

import static org.assertj.core.api.Assertions.assertThat;

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
        return new RenderCache(dir, new NovelRenderer(44),
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

    private static List<Path> all(List<RenderedFormat> formats) {
        return formats.stream().flatMap(f -> f.files().stream()).toList();
    }

    @Test
    void writesAllThreeFormats() {
        List<RenderedFormat> formats = cache().imagesFor(7, input("Xin chào"));

        assertThat(formats).extracting(f -> f.format().key()).containsExactly("s", "m", "l");
        assertThat(all(formats)).isNotEmpty().allSatisfy(f -> assertThat(f).isRegularFile());
        assertThat(formats.getFirst().files().getFirst().getFileName().toString())
                .matches("[0-9a-f]{16}-1\\.png");
    }

    @Test
    void secondCallDoesNotRedraw() throws IOException {
        RenderCache cache = cache();
        List<RenderedFormat> first = cache.imagesFor(7, input("Xin chào"));
        FileTime written = FileTime.fromMillis(1_000);
        for (Path f : all(first)) {
            Files.setLastModifiedTime(f, written);
        }

        List<RenderedFormat> second = cache.imagesFor(7, input("Xin chào"));

        assertThat(second).isEqualTo(first);
        for (Path f : all(second)) {
            assertThat(Files.getLastModifiedTime(f)).isEqualTo(written);
        }
    }

    @Test
    void newTextReplacesAllFormats() throws IOException {
        RenderCache cache = cache();
        List<Path> old = all(cache.imagesFor(7, input("Xin chào")));

        List<Path> fresh = all(cache.imagesFor(7, input("Tạm biệt")));

        assertThat(fresh).doesNotContainAnyElementsOf(old);
        assertThat(old).noneSatisfy(f -> assertThat(f).exists());
        assertThat(filesIn(7)).containsExactlyInAnyOrderElementsOf(fresh);
    }

    @Test
    void oneMissingFileRedrawsOnlyThatFormat() throws IOException {
        RenderCache cache = cache();
        List<RenderedFormat> first = cache.imagesFor(7, input("Xin chào"));
        FileTime written = FileTime.fromMillis(1_000);
        for (Path f : first.get(0).files()) {
            Files.setLastModifiedTime(f, written);
        }
        Files.delete(first.get(1).files().getFirst());

        List<RenderedFormat> second = cache.imagesFor(7, input("Xin chào"));

        assertThat(second.get(1).files()).allSatisfy(f -> assertThat(f).isRegularFile());
        for (Path f : second.get(0).files()) {
            assertThat(Files.getLastModifiedTime(f)).isEqualTo(written);
        }
    }

    private void corruptCountsAndCheck(byte[] garbage) throws IOException {
        RenderCache cache = cache();
        List<RenderedFormat> first = cache.imagesFor(7, input("Xin chào"));
        try (Stream<Path> files = Files.list(dir.resolve("7"))) {
            for (Path c : files.filter(f -> f.toString().endsWith(".count")).toList()) {
                Files.write(c, garbage);
            }
        }

        List<RenderedFormat> second = cache.imagesFor(7, input("Xin chào"));

        assertThat(second).isEqualTo(first);
        assertThat(all(second)).isNotEmpty().allSatisfy(f -> assertThat(f).isRegularFile());
        try (Stream<Path> files = Files.list(dir.resolve("7"))) {
            for (Path c : files.filter(f -> f.toString().endsWith(".count")).toList()) {
                assertThat(Files.readString(c)).matches("[1-9][0-9]*");
            }
        }
    }

    @Test
    void nulFilledCountIsRedrawn() throws IOException {
        corruptCountsAndCheck(new byte[] {0, 0});
    }

    @Test
    void emptyOrGarbageCountIsRedrawn() throws IOException {
        corruptCountsAndCheck(new byte[0]);
        corruptCountsAndCheck("abc".getBytes());
        corruptCountsAndCheck("0".getBytes());
    }

    @Test
    void strayTmpOfOldHashIsRemoved() throws IOException {
        RenderCache cache = cache();
        cache.imagesFor(7, input("Xin chào"));
        Path stray = dir.resolve("7").resolve("deadbeefdeadbeef.count.tmp");
        Files.writeString(stray, "1");

        cache.imagesFor(7, input("Xin chào"));

        assertThat(stray).doesNotExist();
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
