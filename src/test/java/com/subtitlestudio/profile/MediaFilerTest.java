package com.subtitlestudio.profile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.fanfic.Fanfic;
import com.subtitlestudio.fanfic.FanficRepository;
import com.subtitlestudio.novel.Chapter;
import com.subtitlestudio.novel.ChapterPage;
import com.subtitlestudio.novel.ChapterPageRepository;
import com.subtitlestudio.novel.ChapterRepository;
import com.subtitlestudio.novel.Novel;
import com.subtitlestudio.novel.NovelRepository;
import com.subtitlestudio.novel.NovelStatus;
import com.subtitlestudio.photo.PhotoPost;
import com.subtitlestudio.photo.PhotoPostRepository;
import com.subtitlestudio.photo.PhotoSource;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.work.Person;
import com.subtitlestudio.work.PersonRepository;
import com.subtitlestudio.work.Work;
import com.subtitlestudio.work.WorkCategory;
import com.subtitlestudio.work.WorkRepository;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.metamodel.EntityType;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({MediaService.class, MediaStorage.class, MediaFiler.class, ImageSniffer.class, ImageResizer.class,
        MediaFilerTest.Config.class})
// Real commits: the filer runs after the saving transaction commits.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class MediaFilerTest {

    private static final Instant NOW = Instant.parse("2026-11-12T10:00:00Z");

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
                            Duration.ofMinutes(60), 0.3, List.of()),
                    new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
        }
    }

    @Autowired private MediaService service;
    @Autowired private MediaFiler filer;
    @Autowired private MediaRepository media;
    @Autowired private ProfileRepository profiles;
    @Autowired private ProfileBlockRepository blocks;
    @Autowired private ProfileBannerImageRepository banners;
    @Autowired private PhotoPostRepository photoPosts;
    @Autowired private WorkRepository works;
    @Autowired private PersonRepository people;
    @Autowired private NovelRepository novels;
    @Autowired private ChapterRepository chapters;
    @Autowired private ChapterPageRepository chapterPages;
    @Autowired private FanficRepository fanfics;
    @Autowired private MutableClock clock;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private EntityManagerFactory emf;
    @Autowired private PlatformTransactionManager txManager;

    @BeforeEach
    void setUp() {
        clock.reset();
    }

    @AfterEach
    void cleanUp() throws IOException {
        chapterPages.deleteAll();
        chapters.deleteAll();
        novels.deleteAll();
        banners.deleteAll();
        blocks.deleteAll();
        photoPosts.deleteAll();
        works.deleteAll();
        people.deleteAll();
        fanfics.deleteAll();
        Profile emi = profiles.findBySlug("emi").orElseThrow();
        emi.updateHeader(emi.getDisplayName(), null, null, null, NOW);
        profiles.saveAndFlush(emi);
        media.deleteAll();
        Path dir = dataDir.resolve("media");
        if (Files.isDirectory(dir)) {
            try (Stream<Path> files = Files.walk(dir)) {
                for (Path f : files.sorted(Comparator.reverseOrder()).toList()) {
                    Files.delete(f);
                }
            }
        }
    }

    private static final java.util.concurrent.atomic.AtomicInteger SCANS = new java.util.concurrent.atomic.AtomicInteger();

    /** The storage scans at most once a minute and is shared by all tests, so jump to a time no earlier test scanned at. */
    private void pastRescanWindow() {
        clock.reset();
        clock.advance(Duration.ofMinutes(5L * SCANS.incrementAndGet()));
    }

    private Media upload(String name) {
        return service.store(name, ImageSnifferTest.PNG);
    }

    /** Path of the image relative to the media directory, as the database records it now. */
    private String pathOf(Media m) {
        return media.findById(m.getId()).orElseThrow().getStoragePath();
    }

    private Path file(Media m) {
        return dataDir.resolve("media").resolve(pathOf(m));
    }

    private static String key8(Media m) {
        return m.getStorageKey().substring(0, 8);
    }

    private Path moveAway(Media m, String relative) throws IOException {
        Path elsewhere = dataDir.resolve("media").resolve(relative);
        Files.createDirectories(elsewhere.getParent());
        Files.move(file(m), elsewhere);
        return elsewhere;
    }

    // ---- uploads and attaching ----

    @Test
    void newUploadLandsInTheInbox() {
        Media m = upload("Emi Post.png");

        assertThat(pathOf(m)).isEqualTo("_inbox/2026-11-12_emi-post_" + key8(m) + ".png");
        assertThat(file(m)).exists();
    }

    @Test
    void attachingMovesTheFileAndKeepsItReadable() {
        Media m = upload("shot.png");
        PhotoPost post = new PhotoPost(NOW);
        post.set("https://www.instagram.com/p/AAA/", m, "t", LocalDate.parse("2026-11-09"),
                PhotoSource.FAN, null, Set.of(), NOW);
        photoPosts.saveAndFlush(post);

        assertThat(pathOf(m)).isEqualTo("photos/2026-11-12_shot_" + key8(m) + ".png");
        assertThat(dataDir.resolve("media/_inbox/2026-11-12_shot_" + key8(m) + ".png")).doesNotExist();
        assertThat(service.load(m.getId()).path()).isEqualTo(file(m)).exists();
    }

    @Test
    void everyReferenceKindGoesToItsFolder() {
        Profile emi = profiles.findBySlug("emi").orElseThrow();
        Media portrait = upload("p.png");
        emi.updateHeader(emi.getDisplayName(), null, null, portrait, NOW);
        profiles.saveAndFlush(emi);

        Media banner = upload("b.png");
        banners.saveAndFlush(new ProfileBannerImage(emi, banner, 1, null, NOW));

        Media block = upload("k.png");
        ProfileBlock imageBlock = new ProfileBlock(emi, 1, BlockType.IMAGE, NOW);
        imageBlock.setContent(null, null, block, null, null, List.of(), NOW);
        blocks.saveAndFlush(imageBlock);

        Media item = upload("i.png");
        ProfileBlock gallery = new ProfileBlock(emi, 2, BlockType.GALLERY, NOW);
        gallery.setContent(null, null, null, null, null, List.of(new ProfileBlockItem(gallery, 1, "l", null, item)), NOW);
        blocks.saveAndFlush(gallery);

        Media cover = upload("c.png");
        Work work = new Work(NOW);
        work.set("W", cover, null, List.of(WorkCategory.MUSIC), null, null, null, List.of(), List.of(), NOW);
        works.saveAndFlush(work);

        Media avatar = upload("a.png");
        people.saveAndFlush(new Person("Bonnie", avatar, NOW));

        Media novelCover = upload("n.png");
        Novel novel = new Novel("night-sky", "N", NovelStatus.ONGOING, NOW);
        novel.setCover(novelCover);
        novels.saveAndFlush(novel);

        Media page = upload("pg.png");
        Chapter chapter = chapters.saveAndFlush(new Chapter(novel, 1, null, NOW));
        chapterPages.saveAndFlush(new ChapterPage(chapter, 1, page));

        Media fanficCover = upload("f.png");
        Fanfic f = new Fanfic(NOW);
        f.set("1", "https://www.wattpad.com/story/1", "S", null, null, null, fanficCover, null, 0, 0, 0, 0, false, null, NOW);
        fanfics.saveAndFlush(f);

        assertThat(pathOf(portrait)).startsWith("profiles/portraits/2026-11-12_p_");
        assertThat(pathOf(banner)).startsWith("profiles/banners/");
        assertThat(pathOf(block)).startsWith("profiles/blocks/");
        assertThat(pathOf(item)).startsWith("profiles/blocks/");
        assertThat(pathOf(cover)).startsWith("works/covers/");
        assertThat(pathOf(avatar)).startsWith("works/people/");
        assertThat(pathOf(novelCover)).startsWith("novels/covers/");
        assertThat(pathOf(page)).startsWith("novels/night-sky/2026-11-12_pg_");
        assertThat(pathOf(fanficCover)).startsWith("fanfics/covers/");
        for (Media m : List.of(portrait, banner, block, item, cover, avatar, novelCover, page, fanficCover)) {
            assertThat(file(m)).as(pathOf(m)).exists();
        }
    }

    @Test
    void renamingTheNovelRefilesItsPages() {
        Novel novel = novels.saveAndFlush(new Novel("old-slug", "N", NovelStatus.ONGOING, NOW));
        Media page = upload("pg.png");
        chapterPages.saveAndFlush(new ChapterPage(chapters.saveAndFlush(new Chapter(novel, 1, null, NOW)), 1, page));
        assertThat(pathOf(page)).startsWith("novels/old-slug/");

        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            novel.setSlug("new-slug");
            novels.saveAndFlush(novel);
            filer.fileNovelPagesAfterCommit(novel.getId());
        });

        assertThat(pathOf(page)).startsWith("novels/new-slug/");
        assertThat(file(page)).exists();
    }

    @Test
    void firstReferenceInPriorityOrderDecidesTheFolder() {
        Media shared = upload("shared.png");
        Novel novel = new Novel("n1", "N", NovelStatus.ONGOING, NOW);
        novel.setCover(shared);
        novels.saveAndFlush(novel);
        people.saveAndFlush(new Person("Emi", shared, NOW));

        assertThat(pathOf(shared)).startsWith("works/people/");
    }

    @Test
    void nameCollisionInTheTargetGetsASuffix() throws IOException {
        Media m = upload("dup.png");
        String wanted = filer.desiredPath(media.findById(m.getId()).orElseThrow()).replace("_inbox/", "photos/");
        Files.createDirectories(dataDir.resolve("media").resolve(wanted).getParent());
        Files.writeString(dataDir.resolve("media").resolve(wanted), "someone else");
        PhotoPost post = new PhotoPost(NOW);
        post.set("https://www.instagram.com/p/BBB/", m, "t", LocalDate.parse("2026-11-09"),
                PhotoSource.FAN, null, Set.of(), NOW);

        photoPosts.saveAndFlush(post);

        assertThat(pathOf(m)).isEqualTo(wanted.replace(".png", "-2.png"));
        assertThat(Files.readString(dataDir.resolve("media").resolve(wanted))).isEqualTo("someone else");
        assertThat(file(m)).exists();
    }

    @Test
    void rolledBackSaveDoesNotMoveTheFile() {
        Media m = upload("keep.png");
        String before = pathOf(m);

        new TransactionTemplate(txManager).executeWithoutResult(status -> {
            people.saveAndFlush(new Person("Gone", media.findById(m.getId()).orElseThrow(), NOW));
            status.setRollbackOnly();
        });

        assertThat(pathOf(m)).isEqualTo(before);
        assertThat(file(m)).exists();
    }

    // ---- reconcile ----

    @Test
    void reconcileMigratesLegacyFlatFilesAndIsIdempotent() throws IOException {
        Media attached = upload("legacy.png");
        Media loose = upload("loose.png");
        people.saveAndFlush(new Person("Emi", attached, NOW));
        // Turn both back into legacy rows: flat file {key}.png and NULL storage_path.
        for (Media m : List.of(attached, loose)) {
            Path flat = dataDir.resolve("media").resolve(m.getStorageKey() + ".png");
            Files.move(file(m), flat);
            jdbc.update("update t_media set storage_path = null where id = ?", m.getId());
        }

        filer.reconcile();

        assertThat(pathOf(attached)).startsWith("works/people/2026-11-12_legacy_");
        assertThat(pathOf(loose)).startsWith("_inbox/2026-11-12_loose_");
        assertThat(dataDir.resolve("media").resolve(attached.getStorageKey() + ".png")).doesNotExist();
        assertThat(file(attached)).exists();
        assertThat(file(loose)).exists();

        String a = pathOf(attached);
        String b = pathOf(loose);
        filer.reconcile();
        assertThat(pathOf(attached)).isEqualTo(a);
        assertThat(pathOf(loose)).isEqualTo(b);
        assertThat(filer.file(attached.getId())).isEqualTo(MediaFiler.Outcome.IN_PLACE);
    }

    @Test
    void reconcileSurvivesMissingFiles() throws IOException {
        Media gone = upload("gone.png");
        Files.delete(file(gone));

        filer.reconcile();

        assertThat(filer.file(gone.getId())).isEqualTo(MediaFiler.Outcome.MISSING);
        assertThat(filer.file(987654L)).isEqualTo(MediaFiler.Outcome.MISSING);
    }

    // ---- shared directory (another database moved the file) ----

    @Test
    void loadFindsAFileTheOtherDatabaseMoved() throws IOException {
        Media m = upload("moved.png");
        Path elsewhere = moveAway(m, "photos/2026-11-12_moved_" + key8(m) + ".png");
        pastRescanWindow();
        // storage_path is stale: it still says _inbox/...

        assertThat(service.load(m.getId()).path()).isEqualTo(elsewhere);
    }

    @Test
    void loadFindsALegacyNamedFileToo() throws IOException {
        Media m = upload("legacy.png");
        Path flat = moveAway(m, "other/" + m.getStorageKey() + ".png");
        pastRescanWindow();

        assertThat(service.load(m.getId()).path()).isEqualTo(flat);
    }

    @Test
    void lookupScansAtMostOncePerMinute() throws IOException {
        Media m = upload("late.png");
        Path hidden = dataDir.resolve("late-hidden.png");
        Files.move(file(m), hidden);
        pastRescanWindow();
        assertThat(catchThrowable(() -> service.load(m.getId()))).isInstanceOf(MediaNotFoundException.class);

        Path back = dataDir.resolve("media/x/2026-11-12_late_" + key8(m) + ".png");
        Files.createDirectories(back.getParent());
        Files.move(hidden, back);
        clock.advance(Duration.ofSeconds(30));
        assertThat(catchThrowable(() -> service.load(m.getId()))).isInstanceOf(MediaNotFoundException.class);

        clock.advance(Duration.ofSeconds(31));
        assertThat(service.load(m.getId()).path()).isEqualTo(back);
    }

    @Test
    void filingFollowsAFileTheOtherDatabaseAlreadyMoved() throws IOException {
        Media m = upload("race.png");
        Path elsewhere = moveAway(m, "photos/2026-11-12_race_" + key8(m) + ".png");
        pastRescanWindow();

        assertThat(filer.file(m.getId())).isEqualTo(MediaFiler.Outcome.MOVED);

        assertThat(pathOf(m)).isEqualTo("_inbox/2026-11-12_race_" + key8(m) + ".png");
        assertThat(file(m)).exists();
        assertThat(elsewhere).doesNotExist();
    }

    @Test
    void deleteRemovesTheFileWhereverItIsNow() throws IOException {
        Media m = upload("del.png");
        Path elsewhere = moveAway(m, "photos/2026-11-12_del_" + key8(m) + ".png");
        pastRescanWindow();

        service.deleteIfUnreferenced(List.of(m.getId()));

        assertThat(media.existsById(m.getId())).isFalse();
        assertThat(elsewhere).doesNotExist();
    }

    @Test
    void deleteRemovesTheFileAtItsRecordedPath() {
        Media m = upload("filed.png");
        Path inbox = file(m);

        service.deleteIfUnreferenced(List.of(m.getId()));

        assertThat(inbox).doesNotExist();
    }

    @Test
    void unreferencedCleanupDeletesOldInboxUploadsAndKeepsFiledOnes() {
        Media old = upload("old.png");
        Media kept = upload("kept.png");
        people.saveAndFlush(new Person("Emi", kept, NOW));
        clock.advance(Duration.ofHours(30));

        assertThat(service.deleteUnreferencedOlderThan(Duration.ofHours(24))).isEqualTo(1);

        assertThat(media.existsById(old.getId())).isFalse();
        assertThat(media.existsById(kept.getId())).isTrue();
        assertThat(file(kept)).exists();
        assertThat(dataDir.resolve("media/_inbox")).isDirectoryNotContaining("glob:**_" + key8(old) + ".png");
    }

    // ---- guard ----

    /** Every entity attribute that points at Media must have a filing rule (and a branch in the listener). */
    @Test
    void everyMediaReferenceHasAFilingRule() {
        Set<String> points = emf.getMetamodel().getEntities().stream()
                .flatMap(e -> attributesOfMedia(e).stream())
                .collect(Collectors.toSet());

        assertThat(MediaFiler.RULES).extracting(MediaFiler.Rule::point).containsExactlyInAnyOrderElementsOf(points);
    }

    private static List<String> attributesOfMedia(EntityType<?> e) {
        return e.getAttributes().stream()
                .filter(a -> a.getJavaType() == Media.class)
                .map(a -> e.getName() + "." + a.getName())
                .toList();
    }
}
