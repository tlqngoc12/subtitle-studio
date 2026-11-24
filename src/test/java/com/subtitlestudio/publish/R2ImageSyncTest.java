package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class R2ImageSyncTest {

    private FakeR2Store store;
    private R2ImageSync sync;

    @BeforeEach
    void setUp() {
        store = new FakeR2Store();
        sync = new R2ImageSync(store);
    }

    private static ChapterImage img(String key) {
        return new ChapterImage(key, Path.of(key.replace('/', '_')));
    }

    private static List<ChapterImage> imgs(int n) {
        List<ChapterImage> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            out.add(img("novel-images/n/" + i + ".webp"));
        }
        return out;
    }

    @Test
    void uploadsOnlyMissingKeysOnceEach() {
        store.seed("novel-images/a/1.webp");

        int n = sync.upload(List.of(img("novel-images/a/1.webp"), img("novel-images/a/2.webp"), img("novel-images/a/2.webp")),
                (d, t) -> {});

        assertThat(n).isEqualTo(1);
        assertThat(store.puts()).containsExactly("novel-images/a/2.webp");
        assertThat(store.contentTypeOf("novel-images/a/2.webp")).isEqualTo("image/webp");
    }

    @Test
    void uploadFailureThrowsPublishFailed() {
        store.failPut("novel-images/a/2.webp");

        assertThatThrownBy(() -> sync.upload(List.of(img("novel-images/a/2.webp")), (d, t) -> {}))
                .isInstanceOf(PublishFailedException.class)
                .extracting("userMessage").isEqualTo("Could not upload chapter images to R2.");
    }

    @Test
    void listFailureThrowsPublishFailed() {
        store.failList();

        assertThatThrownBy(() -> sync.upload(List.of(img("novel-images/a/2.webp")), (d, t) -> {}))
                .isInstanceOf(PublishFailedException.class)
                .extracting("userMessage").isEqualTo("Could not upload chapter images to R2.");
    }

    @Test
    void prunesKeysNotKeptOnlyUnderPrefix() {
        store.seed("novel-images/a/1.webp", "novel-images/a/2.webp", "novel-images/old/9.webp", "other/x.txt");

        int n = sync.prune(List.of(img("novel-images/a/1.webp"), img("novel-images/a/2.webp")));

        assertThat(n).isEqualTo(1);
        assertThat(store.deleted()).containsExactly("novel-images/old/9.webp");
    }

    @Test
    void pruneFailureIsSwallowed() {
        store.seed("novel-images/a/1.webp", "novel-images/a/2.webp", "novel-images/a/3.webp", "novel-images/a/4.webp");
        store.failDelete();

        int n = sync.prune(List.of(img("novel-images/a/1.webp"), img("novel-images/a/2.webp"), img("novel-images/a/3.webp")));

        assertThat(n).isZero();
    }

    @Test
    void pruneListFailureIsSwallowed() {
        store.failList();

        assertThat(sync.prune(imgs(3))).isZero();
    }

    @Test
    void manyKeysAreListedAndPrunedCorrectly() {
        List<ChapterImage> all = imgs(2500);
        store.seed(all.stream().map(ChapterImage::key).toArray(String[]::new));

        int n = sync.prune(all.subList(0, 2000));

        assertThat(n).isEqualTo(500);
        assertThat(store.deleted()).hasSize(500).doesNotContain("novel-images/n/0.webp").contains("novel-images/n/2499.webp");
    }

    @Test
    void emptyKeepNeverDeletes() {
        store.seed(imgs(10).stream().map(ChapterImage::key).toArray(String[]::new));

        assertThat(sync.prune(List.of())).isZero();
        assertThat(store.deleted()).isEmpty();
    }

    @Test
    void deletingMoreThanHalfIsRefused() {
        List<ChapterImage> all = imgs(10);
        store.seed(all.stream().map(ChapterImage::key).toArray(String[]::new));

        assertThat(sync.prune(all.subList(0, 4))).isZero();
        assertThat(store.deleted()).isEmpty();

        assertThat(sync.prune(all.subList(0, 5))).isEqualTo(5);
        assertThat(store.deleted()).hasSize(5);
    }

    @Test
    void uploadReportsProgress() {
        List<int[]> seen = new ArrayList<>();

        int n = sync.upload(imgs(250), (d, t) -> {
            synchronized (seen) {
                seen.add(new int[] {d, t});
            }
        });

        assertThat(n).isEqualTo(250);
        assertThat(seen).isNotEmpty();
        assertThat(seen.get(0)).containsExactly(0, 250);
        assertThat(seen.get(seen.size() - 1)).containsExactly(250, 250);
        assertThat(seen.size()).isGreaterThan(2);
        assertThat(seen).allSatisfy(p -> assertThat(p[1]).isEqualTo(250));
    }
}
