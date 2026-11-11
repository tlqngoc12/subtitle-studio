package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.novel.Chapter;
import com.subtitlestudio.novel.ChapterPage;
import com.subtitlestudio.novel.ChapterPageRepository;
import com.subtitlestudio.novel.ChapterRepository;
import com.subtitlestudio.novel.Novel;
import com.subtitlestudio.novel.NovelRepository;
import com.subtitlestudio.novel.NovelStatus;
import com.subtitlestudio.test.MutableClock;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({MediaService.class, ImageSniffer.class, ImageResizer.class, MediaServiceTest.Config.class})
// Real commits: file deletion waits for the transaction to commit.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class MediaServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-03T10:00:00Z");

    @TempDir
    static Path dataDir;

    @TestConfiguration
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }

        @Bean
        SubtitleStudioProperties properties() {
            return new SubtitleStudioProperties(
                    new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir,
                    new SubtitleStudioProperties.Gemini("", "gemini-3.8-flash", Duration.ofMinutes(3),
                            Duration.ofMinutes(60), 0.3, java.util.List.of()),
                    new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
        }
    }

    @Autowired
    private MediaService service;

    @Autowired
    private MediaRepository media;

    @Autowired
    private ProfileRepository profiles;

    @Autowired
    private ProfileBlockRepository blocks;

    @Autowired
    private MutableClock clock;

    @Autowired
    private PlatformTransactionManager txManager;

    @BeforeEach
    void setUp() {
        clock.reset();
    }

    @Autowired
    private NovelRepository novels;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private ChapterPageRepository chapterPages;

    @AfterEach
    void cleanUp() throws IOException {
        chapterPages.deleteAll();
        chapters.deleteAll();
        novels.deleteAll();
        blocks.deleteAll();
        media.deleteAll();
        Path dir = dataDir.resolve("media");
        if (Files.isDirectory(dir)) {
            try (Stream<Path> files = Files.list(dir)) {
                for (Path f : files.toList()) {
                    Files.delete(f);
                }
            }
        }
    }

    private Path fileOf(Media m, String ext) {
        return dataDir.resolve("media").resolve(m.getStorageKey() + "." + ext);
    }

    private Media storeAt(Instant at) {
        clock.reset();
        clock.advance(Duration.between(NOW, at));
        Media m = service.store("x.png", ImageSnifferTest.PNG);
        clock.reset();
        return m;
    }

    private void useInImageBlock(Media m) {
        Profile emi = profiles.findBySlug("emi").orElseThrow();
        ProfileBlock block = new ProfileBlock(emi, 1, BlockType.IMAGE, NOW);
        block.setContent(null, null, m, null, null, List.of(), NOW);
        blocks.saveAndFlush(block);
    }

    @Test
    void storesFileNamedById() throws IOException {
        Media m = service.store("a b.png", ImageSnifferTest.PNG);

        assertThat(Files.readAllBytes(fileOf(m, "png"))).isEqualTo(ImageSnifferTest.PNG);
        Media saved = media.findById(m.getId()).orElseThrow();
        assertThat(saved.getContentType()).isEqualTo("image/png");
        assertThat(saved.getSizeBytes()).isEqualTo(ImageSnifferTest.PNG.length);
        assertThat(saved.getOriginalName()).isEqualTo("a b.png");
        assertThat(saved.getCreatedAt()).isEqualTo(NOW);
    }

    /** The H2 dev database and Oracle share ./data/media and both sequences start at 1. */
    @Test
    void neverOverwritesFilesOfAnotherDatabase() throws IOException {
        Path dir = dataDir.resolve("media");
        Files.createDirectories(dir);
        byte[] other = ImageSnifferTest.ascii("other database's image");
        for (int id = 1; id <= 200; id++) {
            Files.write(dir.resolve(id + ".png"), other);
        }

        Media m = service.store("a.png", ImageSnifferTest.PNG);

        for (int id = 1; id <= 200; id++) {
            assertThat(Files.readAllBytes(dir.resolve(id + ".png"))).as("file %d.png", id).isEqualTo(other);
        }
        assertThat(Files.readAllBytes(service.load(m.getId()).path())).isEqualTo(ImageSnifferTest.PNG);
    }

    @Test
    void originalNameNeverBecomesPath() throws IOException {
        Media m = service.store("../../evil.png", ImageSnifferTest.JPEG);

        assertThat(fileOf(m, "jpg")).exists();
        try (Stream<Path> all = Files.walk(dataDir)) {
            assertThat(all.filter(Files::isRegularFile).toList()).containsExactly(fileOf(m, "jpg"));
        }
    }

    @Test
    void rejectsNonImage() {
        assertThatThrownBy(() -> service.store("a.jpg", ImageSnifferTest.ascii("<html>")))
                .isInstanceOf(InvalidMediaException.class);
        assertThat(media.count()).isZero();
    }

    @Test
    void rejectsEmpty() {
        assertThatThrownBy(() -> service.store("a.png", new byte[0])).isInstanceOf(InvalidMediaException.class);
    }

    @Test
    void rejectsOver10Mb() {
        byte[] big = new byte[(int) MediaService.MAX_BYTES + 1];
        System.arraycopy(ImageSnifferTest.PNG, 0, big, 0, ImageSnifferTest.PNG.length);

        assertThatThrownBy(() -> service.store("big.png", big)).isInstanceOf(MediaTooLargeException.class);
    }

    @Test
    void loadReturnsFileAndType() {
        Media m = service.store("a.webp", ImageSnifferTest.WEBP);

        StoredMedia stored = service.load(m.getId());

        assertThat(stored.path()).isEqualTo(fileOf(m, "webp"));
        assertThat(stored.contentType()).isEqualTo("image/webp");
    }

    @Test
    void loadUnknownIdThrows() {
        assertThatThrownBy(() -> service.load(424242)).isInstanceOf(MediaNotFoundException.class);
    }

    @Test
    void loadMissingFileThrows() throws IOException {
        Media m = service.store("a.png", ImageSnifferTest.PNG);
        Files.delete(fileOf(m, "png"));

        assertThatThrownBy(() -> service.load(m.getId())).isInstanceOf(MediaNotFoundException.class);
    }

    @Test
    void deletesUnreferencedOlderThan24h() {
        Media used = storeAt(NOW.minus(Duration.ofHours(25)));
        Media abandoned = storeAt(NOW.minus(Duration.ofHours(25)));
        Media recent = storeAt(NOW.minus(Duration.ofHours(1)));
        useInImageBlock(used);

        assertThat(service.deleteUnreferencedOlderThan(Duration.ofHours(24))).isEqualTo(1);

        assertThat(media.findAll()).extracting(Media::getId).containsExactlyInAnyOrder(used.getId(), recent.getId());
        assertThat(fileOf(abandoned, "png")).doesNotExist();
        assertThat(fileOf(used, "png")).exists();
        assertThat(fileOf(recent, "png")).exists();
    }

    @Test
    void deleteIfUnreferencedKeepsUsedMedia() {
        Media used = service.store("a.png", ImageSnifferTest.PNG);
        Media free = service.store("b.png", ImageSnifferTest.PNG);
        useInImageBlock(used);

        service.deleteIfUnreferenced(List.of(used.getId(), free.getId()));

        assertThat(media.findAll()).extracting(Media::getId).containsExactly(used.getId());
        assertThat(fileOf(free, "png")).doesNotExist();
        assertThat(fileOf(used, "png")).exists();
    }

    @Test
    void abandonedCleanupKeepsNovelCoverAndChapterPages() {
        Media cover = storeAt(NOW.minus(Duration.ofHours(25)));
        Media page = storeAt(NOW.minus(Duration.ofHours(25)));
        Media abandoned = storeAt(NOW.minus(Duration.ofHours(25)));
        useAsNovelCoverAndPage(cover, page);

        assertThat(service.deleteUnreferencedOlderThan(Duration.ofHours(24))).isEqualTo(1);

        assertThat(media.findAll()).extracting(Media::getId).containsExactlyInAnyOrder(cover.getId(), page.getId());
        assertThat(fileOf(abandoned, "png")).doesNotExist();
    }

    @Test
    void deleteIfUnreferencedKeepsNovelImages() {
        Media cover = service.store("c.png", ImageSnifferTest.PNG);
        Media page = service.store("p.png", ImageSnifferTest.PNG);
        useAsNovelCoverAndPage(cover, page);

        service.deleteIfUnreferenced(List.of(cover.getId(), page.getId()));

        assertThat(media.findAll()).extracting(Media::getId).containsExactlyInAnyOrder(cover.getId(), page.getId());
    }

    private void useAsNovelCoverAndPage(Media cover, Media page) {
        Novel novel = new Novel("n-" + cover.getId(), "N", NovelStatus.ONGOING, NOW);
        novel.setCover(cover);
        novels.saveAndFlush(novel);
        Chapter chapter = chapters.saveAndFlush(new Chapter(novel, 1, null, NOW));
        chapterPages.saveAndFlush(new ChapterPage(chapter, 1, page));
    }

    @Test
    void fileDeletionWaitsForCommit() {
        Media free = service.store("b.png", ImageSnifferTest.PNG);

        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            service.deleteIfUnreferenced(List.of(free.getId()));
            status.setRollbackOnly();
        });

        assertThat(media.existsById(free.getId())).isTrue();
        assertThat(fileOf(free, "png")).exists();
    }

    @Test
    void storeResizedWritesOneFileWithReturnedSize() throws IOException {
        Media m = service.storeResized("big.png", ImageResizerTest.png(3000, 2000), 1600);

        Media saved = media.findById(m.getId()).orElseThrow();
        assertThat(saved.getWidth()).isEqualTo(1600);
        assertThat(saved.getHeight()).isEqualTo(1067);
        try (Stream<Path> all = Files.walk(dataDir.resolve("media"))) {
            assertThat(all.filter(Files::isRegularFile).count()).isEqualTo(1);
        }
    }

    @Test
    void oversizedInputRejectedBeforeDecoding() throws IOException {
        byte[] big = new byte[(int) MediaService.MAX_BYTES + 1];
        System.arraycopy(ImageSnifferTest.PNG, 0, big, 0, ImageSnifferTest.PNG.length);

        assertThatThrownBy(() -> service.storeResized("big.png", big, 400)).isInstanceOf(MediaTooLargeException.class);
        assertThat(media.count()).isZero();
        assertThat(Files.exists(dataDir.resolve("media")) ? Files.list(dataDir.resolve("media")).count() : 0L).isZero();
    }

    @Test
    void gifWithMaxSideWritesNothing() throws IOException {
        assertThatThrownBy(() -> service.storeResized("a.gif", ImageSnifferTest.GIF, 400))
                .isInstanceOf(InvalidMediaException.class);
        assertThat(media.count()).isZero();
    }

    @Test
    void portraitCountsAsReference() {
        Media m = storeAt(NOW.minus(Duration.ofDays(2)));
        Profile emi = profiles.findBySlug("emi").orElseThrow();
        emi.updateHeader(emi.getDisplayName(), null, null, m, NOW);
        profiles.saveAndFlush(emi);

        try {
            assertThat(service.deleteUnreferencedOlderThan(Duration.ofHours(24))).isZero();
            assertThat(fileOf(m, "png")).exists();
            assertThat(media.isReferenced(m.getId())).isTrue();
        } finally {
            emi.updateHeader(emi.getDisplayName(), null, null, null, NOW);
            profiles.saveAndFlush(emi);
        }
    }

    @Autowired
    private com.subtitlestudio.photo.PhotoPostRepository photoPosts;

    @Test
    void photoPostCountsAsReference() {
        Media m = storeAt(NOW.minus(Duration.ofDays(2)));
        com.subtitlestudio.photo.PhotoPost post = new com.subtitlestudio.photo.PhotoPost(NOW);
        post.set("https://www.instagram.com/p/AAA/", m, "t", java.time.LocalDate.parse("2026-11-09"),
                com.subtitlestudio.photo.PhotoSource.FAN, null, java.util.Set.of(), NOW);
        photoPosts.saveAndFlush(post);

        try {
            assertThat(service.deleteUnreferencedOlderThan(Duration.ofHours(24))).isZero();
            assertThat(fileOf(m, "png")).exists();
            assertThat(media.isReferenced(m.getId())).isTrue();
        } finally {
            photoPosts.deleteAll();
        }
    }

    @Autowired
    private com.subtitlestudio.work.WorkRepository works;

    @Autowired
    private com.subtitlestudio.work.PersonRepository people;

    @Test
    void workCoverAndPersonAvatarCountAsReferences() {
        Media cover = storeAt(NOW.minus(Duration.ofDays(2)));
        Media avatar = storeAt(NOW.minus(Duration.ofDays(2)));
        com.subtitlestudio.work.Work w = new com.subtitlestudio.work.Work(NOW);
        w.set("W", cover, null, List.of(com.subtitlestudio.work.WorkCategory.MUSIC), null, null, null, List.of(), List.of(), NOW);
        works.saveAndFlush(w);
        people.saveAndFlush(new com.subtitlestudio.work.Person("Bonnie", avatar, NOW));

        try {
            assertThat(service.deleteUnreferencedOlderThan(Duration.ofHours(24))).isZero();
            assertThat(fileOf(cover, "png")).exists();
            assertThat(fileOf(avatar, "png")).exists();
            assertThat(media.isReferenced(cover.getId())).isTrue();
            assertThat(media.isReferenced(avatar.getId())).isTrue();
        } finally {
            works.deleteAll();
            people.deleteAll();
        }
    }
    @Autowired
    private com.subtitlestudio.fanfic.FanficRepository fanfics;

    @Test
    void fanficCoverCountsAsReference() {
        Media cover = storeAt(NOW.minus(Duration.ofDays(2)));
        com.subtitlestudio.fanfic.Fanfic f = new com.subtitlestudio.fanfic.Fanfic(NOW);
        f.set("1", "https://www.wattpad.com/story/1", "S", null, null, null, cover, null, 0, 0, 0, 0, false, null, NOW);
        fanfics.saveAndFlush(f);

        try {
            assertThat(service.deleteUnreferencedOlderThan(Duration.ofHours(24))).isZero();
            assertThat(fileOf(cover, "png")).exists();
            assertThat(media.isReferenced(cover.getId())).isTrue();
        } finally {
            fanfics.deleteAll();
        }
    }
}
