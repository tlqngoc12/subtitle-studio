package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.profile.ImageSniffer;
import com.subtitlestudio.profile.InvalidMediaException;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.profile.MediaTooLargeException;
import com.subtitlestudio.test.MutableClock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.util.unit.DataSize;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({com.subtitlestudio.novel.render.NovelRenderConfig.class, TranslatingModels.class, ChapterService.class, PageRotator.class, MediaService.class, com.subtitlestudio.profile.MediaStorage.class, com.subtitlestudio.profile.MediaFiler.class, ImageSniffer.class, com.subtitlestudio.profile.ImageResizer.class, ChapterServiceTest.Config.class})
class ChapterServiceTest {

    static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

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
                    new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                            List.of()),
                    new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)),
                    new SubtitleStudioProperties.Novel(20, DataSize.ofKilobytes(200), null, "", 0));
        }
    }

    @Autowired
    private ChapterService service;

    @Autowired
    private NovelRepository novels;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private ChapterPageRepository pageRepository;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private ChapterImageRepository chapterImageRepository;

    @Autowired
    private com.subtitlestudio.profile.MediaRepository mediaRepository;

    @Autowired
    private TestEntityManager em;

    private Novel novel;

    @BeforeEach
    void setUp() {
        novel = novels.save(new Novel("n", "Tình Yêu", NovelStatus.ONGOING, NOW));
    }

    private static NamedImage img(String name) {
        return new NamedImage(name, TestImages.png());
    }

    private ChapterDetail chapterWithPages(int no, String... names) {
        ChapterDetail c = service.add(novel.getId(), new ChapterRequest(no, null));
        service.addPages(c.id(), java.util.Arrays.stream(names).map(ChapterServiceTest::img).toList());
        return service.get(c.id());
    }

    private void setStatus(long chapterId, ChapterTranslationStatus t, ChapterPublishStatus p) {
        Chapter c = chapters.findById(chapterId).orElseThrow();
        c.setTranslationStatus(t);
        c.setPublishStatus(p);
        chapters.saveAndFlush(c);
    }

    @Test
    void addDefaultsToNextNumber() {
        assertThat(service.add(novel.getId(), new ChapterRequest(null, null)).chapterNo()).isEqualTo(1);
        service.add(novel.getId(), new ChapterRequest(3, "Ba"));

        ChapterDetail next = service.add(novel.getId(), new ChapterRequest(null, null));

        assertThat(next.chapterNo()).isEqualTo(4);
        assertThat(next.novelTitle()).isEqualTo("Tình Yêu");
        assertThat(next.publishStatus()).isEqualTo(ChapterPublishStatus.DRAFT);
        assertThat(next.translationStatus()).isEqualTo(ChapterTranslationStatus.NONE);
    }

    private List<Long> listOrder() {
        em.flush();
        em.clear();
        return chapters.findByNovelIdOrderBySortOrderAscChapterNoAsc(novel.getId()).stream().map(Chapter::getId).toList();
    }

    @Test
    void reorderChangesTheListButNeverTheChapterNumbers() {
        ChapterDetail c1 = service.add(novel.getId(), new ChapterRequest(1, null));
        ChapterDetail c2 = service.add(novel.getId(), new ChapterRequest(2, null));
        ChapterDetail c3 = service.add(novel.getId(), new ChapterRequest(3, null));

        service.reorderChapters(novel.getId(), new ChapterOrderRequest(List.of(c3.id(), c1.id(), c2.id())));

        assertThat(listOrder()).containsExactly(c3.id(), c1.id(), c2.id());
        assertThat(service.get(c3.id()).chapterNo()).isEqualTo(3);
        assertThat(service.get(c1.id()).chapterNo()).isEqualTo(1);
        // Previous / Next follow the reading order, not the numbers.
        assertThat(service.get(c1.id()).prevChapterId()).isEqualTo(c3.id());
        assertThat(service.get(c1.id()).nextChapterId()).isEqualTo(c2.id());
        assertThat(service.get(c3.id()).prevChapterId()).isNull();
        assertThat(service.get(c2.id()).nextChapterId()).isNull();
    }

    @Test
    void reorderRejectsMissingDuplicateOrForeignIdsAndChangesNothing() {
        ChapterDetail c1 = service.add(novel.getId(), new ChapterRequest(1, null));
        ChapterDetail c2 = service.add(novel.getId(), new ChapterRequest(2, null));
        Novel other = novels.save(new Novel("o", "Other", NovelStatus.ONGOING, NOW));
        ChapterDetail foreign = service.add(other.getId(), new ChapterRequest(1, null));
        List<List<Long>> bad = List.of(
                List.of(c2.id()),
                List.of(c2.id(), c2.id()),
                List.of(c2.id(), c1.id(), c1.id()),
                List.of(c2.id(), foreign.id()),
                List.of(c2.id(), c1.id(), foreign.id()),
                List.of());

        for (List<Long> ids : bad) {
            assertThatThrownBy(() -> service.reorderChapters(novel.getId(), new ChapterOrderRequest(ids)))
                    .isInstanceOf(InvalidChapterException.class)
                    .satisfies(e -> assertThat(((InvalidChapterException) e).errors().getFirst().field())
                            .isEqualTo("chapterIds"));
        }
        assertThatThrownBy(() -> service.reorderChapters(novel.getId(), new ChapterOrderRequest(null)))
                .isInstanceOf(InvalidChapterException.class);

        assertThat(listOrder()).containsExactly(c1.id(), c2.id());
        assertThat(chapters.findById(foreign.id()).orElseThrow().getSortOrder()).isEqualTo(1);
    }

    @Test
    void reorderWorksOnPublishedChapters() {
        ChapterDetail c1 = service.add(novel.getId(), new ChapterRequest(1, null));
        ChapterDetail c2 = service.add(novel.getId(), new ChapterRequest(2, null));
        setStatus(c1.id(), ChapterTranslationStatus.TRANSLATED, ChapterPublishStatus.PUBLISHED);

        service.reorderChapters(novel.getId(), new ChapterOrderRequest(List.of(c2.id(), c1.id())));

        assertThat(listOrder()).containsExactly(c2.id(), c1.id());
    }

    @Test
    void chapterAddedAfterAReorderIsLastEvenWithASmallerNumber() {
        ChapterDetail c5 = service.add(novel.getId(), new ChapterRequest(5, null));
        ChapterDetail c6 = service.add(novel.getId(), new ChapterRequest(6, null));
        service.reorderChapters(novel.getId(), new ChapterOrderRequest(List.of(c6.id(), c5.id())));

        ChapterDetail c2 = service.add(novel.getId(), new ChapterRequest(2, null));
        ChapterDetail auto = service.add(novel.getId(), new ChapterRequest(null, null));

        assertThat(listOrder()).containsExactly(c6.id(), c5.id(), c2.id(), auto.id());
        assertThat(auto.chapterNo()).isEqualTo(7);
    }

    @Test
    void duplicateNumberOnAddAndOnRenumber() {
        service.add(novel.getId(), new ChapterRequest(1, null));
        ChapterDetail two = service.add(novel.getId(), new ChapterRequest(2, null));

        assertThatThrownBy(() -> service.add(novel.getId(), new ChapterRequest(1, null)))
                .isInstanceOf(DuplicateChapterNumberException.class);
        assertThatThrownBy(() -> service.update(two.id(), new ChapterUpdateRequest(1, null, null)))
                .isInstanceOf(DuplicateChapterNumberException.class);
    }

    @Test
    void chapterNoMustBePositiveAndTitleShort() {
        assertThatThrownBy(() -> service.add(novel.getId(), new ChapterRequest(0, null)))
                .isInstanceOf(InvalidChapterException.class);
        assertThatThrownBy(() -> service.add(novel.getId(), new ChapterRequest(1, "x".repeat(201))))
                .isInstanceOf(InvalidChapterException.class);
    }

    @Test
    void uploadAppendsInNaturalOrder() {
        ChapterDetail c = chapterWithPages(1, "p1.png", "p2.png");

        List<PageDto> pages = service.addPages(c.id(), List.of(img("p10.png"), img("p9.png")));

        assertThat(pages).extracting(PageDto::position).containsExactly(1, 2, 3, 4);
        assertThat(pages.get(2).id()).isLessThan(pages.get(3).id());
        assertThat(pages.get(0).mediaUrl()).startsWith("/api/media/");
    }

    /** Counts how often the head and the whole file are read, and whether only one file is "live" at a time. */
    private static final class CountingContent implements NamedImage.Content {
        private final byte[] data;
        private final long reportedSize;
        private final List<String> log;
        private final String name;
        int headReads;
        int fullReads;

        CountingContent(String name, byte[] data, long reportedSize, List<String> log) {
            this.name = name;
            this.data = data;
            this.reportedSize = reportedSize;
            this.log = log;
        }

        @Override
        public long size() {
            return reportedSize;
        }

        @Override
        public byte[] head(int n) {
            headReads++;
            log.add("head:" + name);
            return java.util.Arrays.copyOf(data, Math.min(n, data.length));
        }

        @Override
        public byte[] bytes() {
            fullReads++;
            log.add("bytes:" + name);
            return data;
        }
    }

    @Test
    void addPages_reads_each_file_only_when_storing() {
        ChapterDetail c = service.add(novel.getId(), new ChapterRequest(1, null));
        List<String> log = new ArrayList<>();
        List<CountingContent> contents = new ArrayList<>();
        for (String n : List.of("1.png", "2.png", "3.png")) {
            byte[] png = TestImages.png();
            contents.add(new CountingContent(n, png, png.length, log));
        }

        service.addPages(c.id(), contents.stream().map(x -> new NamedImage(x.name, x)).toList());

        assertThat(contents).allSatisfy(x -> {
            assertThat(x.fullReads).as(x.name + " full reads").isEqualTo(1);
            assertThat(x.headReads).as(x.name + " head reads").isEqualTo(1);
        });
        // validation (heads) finishes before any full read, and each full read happens in the store loop
        assertThat(log.subList(0, 3)).allMatch(e -> e.startsWith("head:"));
        assertThat(log.subList(3, 6)).containsExactly("bytes:1.png", "bytes:2.png", "bytes:3.png");
        assertThat(service.get(c.id()).pages()).hasSize(3);
    }

    @Test
    void addPages_rejects_oversize_by_size_without_reading() {
        ChapterDetail c = service.add(novel.getId(), new ChapterRequest(1, null));
        List<String> log = new ArrayList<>();
        CountingContent big = new CountingContent("big.png", TestImages.png(), 300_000, log);

        assertThatThrownBy(() -> service.addPages(c.id(), List.of(new NamedImage("big.png", big))))
                .isInstanceOf(MediaTooLargeException.class);

        assertThat(big.fullReads).isZero();
        assertThat(big.headReads).isZero();
    }

    @Test
    void uploadRejectsNonImageGifAndTooLarge() {
        ChapterDetail c = service.add(novel.getId(), new ChapterRequest(1, null));

        assertThatThrownBy(() -> service.addPages(c.id(),
                List.of(new NamedImage("a.txt", "hello".getBytes(StandardCharsets.UTF_8)))))
                .isInstanceOf(InvalidMediaException.class);
        assertThatThrownBy(() -> service.addPages(c.id(),
                List.of(new NamedImage("a.gif", "GIF89a....".getBytes(StandardCharsets.US_ASCII)))))
                .isInstanceOf(InvalidMediaException.class);
        assertThatThrownBy(() -> service.addPages(c.id(),
                List.of(new NamedImage("big.png", java.util.Arrays.copyOf(TestImages.png(), 300_000)))))
                .isInstanceOf(MediaTooLargeException.class);
        assertThatThrownBy(() -> service.addPages(c.id(), List.of())).isInstanceOf(InvalidMediaException.class);
    }

    @Test
    void reorderNeedsExactSet() {
        ChapterDetail c = chapterWithPages(1, "a.png", "b.png", "c.png");
        List<Long> ids = c.pages().stream().map(PageDto::id).toList();

        assertThatThrownBy(() -> service.reorder(c.id(), new PageOrderRequest(List.of(ids.get(0), ids.get(1)))))
                .isInstanceOf(InvalidPageOrderException.class);
        assertThatThrownBy(() -> service.reorder(c.id(),
                new PageOrderRequest(List.of(ids.get(0), ids.get(1), ids.get(2), 999L))))
                .isInstanceOf(InvalidPageOrderException.class);
        assertThatThrownBy(() -> service.reorder(c.id(),
                new PageOrderRequest(List.of(ids.get(0), ids.get(0), ids.get(1)))))
                .isInstanceOf(InvalidPageOrderException.class);

        List<PageDto> reordered = service.reorder(c.id(),
                new PageOrderRequest(List.of(ids.get(2), ids.get(0), ids.get(1))));

        assertThat(reordered).extracting(PageDto::id).containsExactly(ids.get(2), ids.get(0), ids.get(1));
        assertThat(reordered).extracting(PageDto::position).containsExactly(1, 2, 3);
    }

    @Test
    void deletePageRenumbersPositions() {
        ChapterDetail c = chapterWithPages(1, "a.png", "b.png", "c.png");

        service.deletePage(c.id(), c.pages().get(0).id());

        assertThat(service.get(c.id()).pages()).extracting(PageDto::position).containsExactly(1, 2);
        assertThatThrownBy(() -> service.deletePage(c.id(), 999L)).isInstanceOf(PageNotFoundException.class);
    }

    @Test
    void editingTextSetsEditedFlag() {
        ChapterDetail c = chapterWithPages(1, "a.png");
        setStatus(c.id(), ChapterTranslationStatus.TRANSLATED, ChapterPublishStatus.DRAFT);
        long pageId = c.pages().getFirst().id();

        ChapterDetail updated = service.update(c.id(),
                new ChapterUpdateRequest(null, null, List.of(new PageTextEdit(pageId, "Xin chào"))));

        assertThat(updated.pages().getFirst().textVi()).isEqualTo("Xin chào");
        assertThat(updated.editedAfterTranslation()).isTrue();
    }

    @Test
    void sameTextDoesNotSetEditedFlag() {
        ChapterDetail c = chapterWithPages(1, "a.png");
        long pageId = c.pages().getFirst().id();
        service.update(c.id(), new ChapterUpdateRequest(null, null, List.of(new PageTextEdit(pageId, "A"))));
        Chapter ch = chapters.findById(c.id()).orElseThrow();
        ch.setEditedAfterTranslation(false);
        chapters.saveAndFlush(ch);

        ChapterDetail again = service.update(c.id(),
                new ChapterUpdateRequest(null, "Tựa", List.of(new PageTextEdit(pageId, "A"))));

        assertThat(again.editedAfterTranslation()).isFalse();
    }

    @Test
    void pageOfAnotherChapterIsNotFound() {
        ChapterDetail a = chapterWithPages(1, "a.png");
        ChapterDetail b = chapterWithPages(2, "b.png");

        assertThatThrownBy(() -> service.update(a.id(), new ChapterUpdateRequest(null, null,
                List.of(new PageTextEdit(b.pages().getFirst().id(), "x"))))).isInstanceOf(PageNotFoundException.class);
    }

    @Test
    void wholeChapterTextIsSavedApartFromPages() {
        ChapterDetail c = chapterWithPages(1, "a.png", "b.png");
        List<Long> ids = c.pages().stream().map(PageDto::id).toList();
        service.update(c.id(), new ChapterUpdateRequest(null, null,
                List.of(new PageTextEdit(ids.get(0), "Một"), new PageTextEdit(ids.get(1), "Hai"))));
        assertThat(service.get(c.id()).text()).isEqualTo("Một\n\nHai");
        Chapter ch = chapters.findById(c.id()).orElseThrow();
        ch.setEditedAfterTranslation(false);

        ChapterDetail edited = service.update(c.id(), new ChapterUpdateRequest(null, null, null, "Cả chương liền mạch"));

        assertThat(edited.text()).isEqualTo("Cả chương liền mạch");
        assertThat(edited.editedAfterTranslation()).isTrue();
        assertThat(edited.pages()).extracting(PageDto::textVi).containsExactly("Một", "Hai");
    }

    @Test
    void blankWholeTextFallsBackToPages() {
        ChapterDetail c = chapterWithPages(1, "a.png");
        long id = c.pages().getFirst().id();
        service.update(c.id(), new ChapterUpdateRequest(null, null, List.of(new PageTextEdit(id, "Một"))));
        service.update(c.id(), new ChapterUpdateRequest(null, null, null, "Sửa"));

        ChapterDetail cleared = service.update(c.id(), new ChapterUpdateRequest(null, null, null, "   "));

        assertThat(cleared.text()).isEqualTo("Một");
    }

    @Test
    void blockedWhileTranslating() {
        ChapterDetail c = chapterWithPages(1, "a.png", "b.png");
        setStatus(c.id(), ChapterTranslationStatus.TRANSLATING, ChapterPublishStatus.DRAFT);
        List<Long> ids = c.pages().stream().map(PageDto::id).toList();

        assertThatThrownBy(() -> service.addPages(c.id(), List.of(img("c.png"))))
                .isInstanceOf(ChapterTranslationInProgressException.class);
        assertThatThrownBy(() -> service.reorder(c.id(), new PageOrderRequest(List.of(ids.get(1), ids.get(0)))))
                .isInstanceOf(ChapterTranslationInProgressException.class);
        assertThatThrownBy(() -> service.deletePage(c.id(), ids.get(0)))
                .isInstanceOf(ChapterTranslationInProgressException.class);
        assertThatThrownBy(() -> service.update(c.id(), new ChapterUpdateRequest(null, "x", null)))
                .isInstanceOf(ChapterTranslationInProgressException.class);
        assertThatThrownBy(() -> service.delete(c.id()))
                .isInstanceOf(ChapterTranslationInProgressException.class);
    }

    @Test
    void labelIsSavedClearedAndLimited() {
        ChapterDetail c = chapterWithPages(31, "a.png");

        ChapterDetail labelled = service.update(c.id(), ChapterUpdateRequest.label("  Ngoại truyện 1 "));
        assertThat(labelled.label()).isEqualTo("Ngoại truyện 1");
        assertThat(labelled.chapterNo()).isEqualTo(31);
        assertThat(service.update(c.id(), new ChapterUpdateRequest(null, "Tựa", null)).label())
                .isEqualTo("Ngoại truyện 1");

        assertThat(service.update(c.id(), ChapterUpdateRequest.label("  ")).label()).isNull();
        assertThatThrownBy(() -> service.update(c.id(), ChapterUpdateRequest.label("x".repeat(101))))
                .isInstanceOf(InvalidChapterException.class);
    }

    @Test
    void labelThatIsTheDefaultNameIsStoredAsNull() {
        ChapterDetail c = chapterWithPages(16, "a.png");

        assertThat(service.update(c.id(), ChapterUpdateRequest.label("Chapter 16")).label()).isNull();
        assertThat(service.update(c.id(), ChapterUpdateRequest.label(" chương  16 ")).label()).isNull();
        assertThat(service.update(c.id(), ChapterUpdateRequest.label("CHAPTER 016")).label()).isNull();
        assertThat(service.update(c.id(), ChapterUpdateRequest.label("Chapter 3")).label()).isEqualTo("Chapter 3");
        assertThat(service.update(c.id(), ChapterUpdateRequest.label("Chapter 16.5")).label())
                .isEqualTo("Chapter 16.5");
        assertThat(service.update(c.id(), ChapterUpdateRequest.label("Ngoại truyện 1")).label())
                .isEqualTo("Ngoại truyện 1");
        assertThat(service.update(c.id(), ChapterUpdateRequest.label("  ")).label()).isNull();
    }

    @Test
    void defaultNameIsComparedWithTheNewChapterNumber() {
        ChapterDetail c = chapterWithPages(16, "a.png");

        ChapterDetail moved = service.update(c.id(), new ChapterUpdateRequest(40, null, null, null, "Chapter 40"));
        assertThat(moved.label()).isNull();
        assertThat(service.update(c.id(), new ChapterUpdateRequest(41, null, null, null, "Chapter 40")).label())
                .isEqualTo("Chapter 40");
    }

    @Test
    void publishedChapterAcceptsALabel() {
        ChapterDetail c = chapterWithPages(5, "a.png");
        setStatus(c.id(), ChapterTranslationStatus.TRANSLATED, ChapterPublishStatus.PUBLISHED);

        assertThat(service.update(c.id(), ChapterUpdateRequest.label("Special")).label()).isEqualTo("Special");
    }

    @Test
    void publishedChapterOnlyAcceptsTextAndTitle() {
        ChapterDetail c = chapterWithPages(3, "a.png", "b.png");
        setStatus(c.id(), ChapterTranslationStatus.TRANSLATED, ChapterPublishStatus.PUBLISHED);
        List<Long> ids = c.pages().stream().map(PageDto::id).toList();

        assertThatThrownBy(() -> service.addPages(c.id(), List.of(img("c.png"))))
                .isInstanceOf(ChapterPublishedException.class);
        assertThatThrownBy(() -> service.reorder(c.id(), new PageOrderRequest(List.of(ids.get(1), ids.get(0)))))
                .isInstanceOf(ChapterPublishedException.class);
        assertThatThrownBy(() -> service.deletePage(c.id(), ids.get(0)))
                .isInstanceOf(ChapterPublishedException.class);
        assertThatThrownBy(() -> service.update(c.id(), new ChapterUpdateRequest(4, null, null)))
                .isInstanceOf(ChapterPublishedException.class);

        ChapterDetail edited = service.update(c.id(), new ChapterUpdateRequest(3, "Tựa mới",
                List.of(new PageTextEdit(ids.get(0), "Sửa chữ"))));

        assertThat(edited.title()).isEqualTo("Tựa mới");
        assertThat(edited.pages().getFirst().textVi()).isEqualTo("Sửa chữ");
        assertThat(edited.pages()).extracting(PageDto::id).containsExactlyElementsOf(ids);
    }

    @Test
    void prevNextIdsFollowReadingOrder() {
        ChapterDetail one = service.add(novel.getId(), new ChapterRequest(1, null));
        ChapterDetail three = service.add(novel.getId(), new ChapterRequest(3, null));
        ChapterDetail five = service.add(novel.getId(), new ChapterRequest(5, null));

        ChapterDetail mid = service.get(three.id());

        assertThat(mid.prevChapterId()).isEqualTo(one.id());
        assertThat(mid.nextChapterId()).isEqualTo(five.id());
        assertThat(service.get(one.id()).prevChapterId()).isNull();
        assertThat(service.get(five.id()).nextChapterId()).isNull();
    }

    @Test
    void deleteRemovesChapterAndPages() throws java.io.IOException {
        ChapterDetail c = chapterWithPages(1, "a.png");
        Path cached = dataDir.resolve("novel-render").resolve(String.valueOf(c.id()));
        java.nio.file.Files.createDirectories(cached);
        java.nio.file.Files.writeString(cached.resolve("x.count"), "1");

        service.delete(c.id());
        em.flush();

        assertThat(cached).doesNotExist();
        assertThatThrownBy(() -> service.get(c.id())).isInstanceOf(ChapterNotFoundException.class);
    }

    @Test
    void deleteRemovesChapterImagesAndTheirUnusedMedia() {
        ChapterDetail c = service.add(novel.getId(), new ChapterRequest(1, null));
        com.subtitlestudio.profile.Media image = mediaService.store("a.png", TestImages.png());
        chapterImageRepository.save(new ChapterImage(chapters.findById(c.id()).orElseThrow(), image,
                "https://img.wattpad.com/a.jpg", 1));
        em.flush();

        service.delete(c.id());
        em.flush();

        assertThat(chapterImageRepository.countByChapterId(c.id())).isZero();
        assertThat(mediaRepository.existsById(image.getId())).isFalse();
    }

    @Test
    void addFromSourceOwnsItsImagesInMarkerOrder() {
        com.subtitlestudio.profile.Media a = mediaService.store("a.png", TestImages.png());
        com.subtitlestudio.profile.Media b = mediaService.store("b.png", TestImages.png());

        long id = service.addFromSource(novel.getId(), "T", "[[image:" + a.getId() + "]]\n\n[[image:" + b.getId() + "]]",
                "77", NOW, List.of(new ChapterImageLink(a.getId(), "https://img.wattpad.com/a.png"),
                        new ChapterImageLink(b.getId(), "https://img.wattpad.com/b.png")));
        em.flush();
        em.clear();

        assertThat(chapterImageRepository.findByChapterIdOrderByPosition(id))
                .extracting(i -> i.getMedia().getId(), ChapterImage::getSourceUrl, ChapterImage::getPosition)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(a.getId(), "https://img.wattpad.com/a.png", 1),
                        org.assertj.core.groups.Tuple.tuple(b.getId(), "https://img.wattpad.com/b.png", 2));
        assertThat(service.imageMediaByUrl(id)).containsEntry("https://img.wattpad.com/a.png", a.getId())
                .containsEntry("https://img.wattpad.com/b.png", b.getId());
        assertThat(mediaRepository.isReferenced(a.getId())).isTrue();
    }

    private long chapterWithMarkers(int no, long... mediaIds) {
        List<ChapterImageLink> links = new ArrayList<>();
        List<String> paragraphs = new ArrayList<>();
        for (long m : mediaIds) {
            paragraphs.add("Text " + m + ".");
            paragraphs.add(ImageMarkers.marker(m));
            links.add(new ChapterImageLink(m, "https://img.wattpad.com/" + no + "/" + m + ".png"));
        }
        return service.addFromSource(novel.getId(), "T", String.join("\n\n", paragraphs), "p" + no, NOW, links);
    }

    private ChapterUpdateRequest text(String text) {
        return new ChapterUpdateRequest(null, null, null, text);
    }

    @Test
    void savingATextWithARemovedMarkerIsAccepted() {
        long a = mediaService.store("a.png", TestImages.png()).getId();
        long b = mediaService.store("b.png", TestImages.png()).getId();
        long id = chapterWithMarkers(1, a, b);

        String one = "Văn bản\n\n[[image:" + a + "]]";
        assertThat(service.update(id, text(one)).text()).isEqualTo(one);
    }

    @Test
    void savingATextWithEveryMarkerRemovedIsAccepted() {
        long a = mediaService.store("a.png", TestImages.png()).getId();
        long b = mediaService.store("b.png", TestImages.png()).getId();
        long id = chapterWithMarkers(1, a, b);

        assertThat(service.update(id, text("Chỉ chữ")).text()).isEqualTo("Chỉ chữ");
        assertThat(service.update(id, text("[[image:" + b + "]]")).text()).isEqualTo("[[image:" + b + "]]");
    }

    @Test
    void savingATextWithAnUnknownOrChangedMarkerIsRefused() {
        long a = mediaService.store("a.png", TestImages.png()).getId();
        long id = chapterWithMarkers(1, a);

        assertThatThrownBy(() -> service.update(id, text("[[image:" + a + "]]\n\n[[image:999999]]")))
                .isInstanceOf(ChapterImageMarkersException.class);
        assertThatThrownBy(() -> service.update(id, text("[[image:" + (a + 1) + "]]")))
                .isInstanceOf(ChapterImageMarkersException.class);
    }

    @Test
    void anImageUsedTwiceInTheOriginalMayBeSavedTwiceOnceButNotThreeTimes() {
        long a = mediaService.store("a.png", TestImages.png()).getId();
        long id = chapterWithMarkers(1, a, a);
        String m = "[[image:" + a + "]]";

        assertThat(service.update(id, text("Chữ\n\n" + m + "\n\nChữ\n\n" + m)).text()).contains(m + "\n\nChữ\n\n" + m);
        assertThat(service.update(id, text("Chữ\n\n" + m)).text()).isEqualTo("Chữ\n\n" + m);
        assertThatThrownBy(() -> service.update(id, text(m + "\n\n" + m + "\n\n" + m)))
                .isInstanceOf(ChapterImageMarkersException.class);
    }

    @Test
    void savingATextWithADuplicatedMarkerIsRefused() {
        long a = mediaService.store("a.png", TestImages.png()).getId();
        long id = chapterWithMarkers(1, a);

        assertThatThrownBy(() -> service.update(id, text("[[image:" + a + "]]\n\n[[image:" + a + "]]")))
                .isInstanceOf(ChapterImageMarkersException.class);
    }

    @Test
    void savingATextThatMovesTheMarkersAndAddsTextIsAccepted() {
        long a = mediaService.store("a.png", TestImages.png()).getId();
        long b = mediaService.store("b.png", TestImages.png()).getId();
        long id = chapterWithMarkers(1, a, b);
        String moved = "[[image:" + b + "]]\n\nChữ dưới ảnh b\n\nVăn bản\n\n[[image:" + a + "]]";

        ChapterDetail saved = service.update(id, text(moved));

        assertThat(saved.text()).isEqualTo(moved);
        assertThat(saved.editedAfterTranslation()).isTrue();
    }

    @Test
    void aChapterWithoutImagesIsNotChecked() {
        ChapterDetail c = service.add(novel.getId(), new ChapterRequest(7, null));

        assertThat(service.update(c.id(), text("Văn bản [[image:5]] tự do")).text()).isEqualTo("Văn bản [[image:5]] tự do");
    }

    @Test
    void anUnchangedTextIsNeverChecked() {
        long a = mediaService.store("a.png", TestImages.png()).getId();
        long id = chapterWithMarkers(1, a);
        service.update(id, text("[[image:" + a + "]]\n\nOK"));

        assertThat(service.update(id, new ChapterUpdateRequest(null, "New title", null, "[[image:" + a + "]]\n\nOK"))
                .title()).isEqualTo("New title");
    }

    @Test
    void replaceSourceTextKeepsKnownImagesUnlinksGoneOnesAndDeletesTheirUnusedMedia() {
        com.subtitlestudio.profile.Media keep = mediaService.store("a.png", TestImages.png());
        com.subtitlestudio.profile.Media gone = mediaService.store("b.png", TestImages.png());
        com.subtitlestudio.profile.Media fresh = mediaService.store("c.png", TestImages.png());
        long id = service.addFromSource(novel.getId(), "T", "x", "78", NOW,
                List.of(new ChapterImageLink(keep.getId(), "https://img.wattpad.com/a.png"),
                        new ChapterImageLink(gone.getId(), "https://img.wattpad.com/b.png")));
        em.flush();

        service.replaceSourceText(id, "y", NOW, List.of(
                new ChapterImageLink(fresh.getId(), "https://img.wattpad.com/c.png"),
                new ChapterImageLink(keep.getId(), "https://img.wattpad.com/a.png")));
        em.flush();
        em.clear();

        assertThat(chapterImageRepository.findByChapterIdOrderByPosition(id))
                .extracting(i -> i.getMedia().getId(), ChapterImage::getPosition)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(fresh.getId(), 1),
                        org.assertj.core.groups.Tuple.tuple(keep.getId(), 2));
        assertThat(mediaRepository.existsById(gone.getId())).isFalse();
        assertThat(mediaRepository.existsById(keep.getId())).isTrue();
    }

    @Test
    void replaceSourceTextWithoutAnImageListLeavesTheImagesAlone() {
        com.subtitlestudio.profile.Media a = mediaService.store("a.png", TestImages.png());
        long id = service.addFromSource(novel.getId(), "T", "x", "79", NOW,
                List.of(new ChapterImageLink(a.getId(), "https://img.wattpad.com/a.png")));
        em.flush();

        service.replaceSourceText(id, "y", NOW);
        em.flush();

        assertThat(chapterImageRepository.countByChapterId(id)).isEqualTo(1);
    }

    private ChapterDetail landscapeChapter(int no, int pageCount) {
        ChapterDetail c = service.add(novel.getId(), new ChapterRequest(no, null));
        List<NamedImage> files = new ArrayList<>();
        for (int i = 1; i <= pageCount; i++) {
            files.add(new NamedImage("p" + i + ".jpg", TestImages.jpeg(300, 200)));
        }
        service.addPages(c.id(), files);
        return service.get(c.id());
    }

    @Test
    void rotatePageStoresNewMediaKeepsText() {
        ChapterDetail c = landscapeChapter(1, 1);
        PageDto before = c.pages().getFirst();
        assertThat(before.landscape()).isTrue();
        service.update(c.id(), new ChapterUpdateRequest(null, null,
                List.of(new PageTextEdit(before.id(), "x")), null));

        PageDto after = service.rotatePage(c.id(), before.id(), RotateDirection.RIGHT).getFirst();

        assertThat(after.mediaUrl()).isNotEqualTo(before.mediaUrl());
        assertThat(after.textVi()).isEqualTo("x");
        assertThat(after.landscape()).isFalse();
    }

    @Test
    void rotatePageRefusedWhenPublished() {
        ChapterDetail c = landscapeChapter(1, 1);
        setStatus(c.id(), ChapterTranslationStatus.TRANSLATED, ChapterPublishStatus.PUBLISHED);

        assertThatThrownBy(() -> service.rotatePage(c.id(), c.pages().getFirst().id(), RotateDirection.LEFT))
                .isInstanceOf(ChapterPublishedException.class);
        assertThatThrownBy(() -> service.rotatePages(c.id(), RotateDirection.LEFT))
                .isInstanceOf(ChapterPublishedException.class);
    }

    @Test
    void rotateKeepsSharedMediaForOtherPage() {
        ChapterDetail c = landscapeChapter(1, 1);
        Chapter chapter = chapters.findById(c.id()).orElseThrow();
        ChapterPage first = pageRepository.findByChapterIdOrderByPosition(c.id()).getFirst();
        pageRepository.saveAndFlush(new ChapterPage(chapter, 2, first.getMedia()));
        ChapterDetail two = service.get(c.id());
        PageDto p1 = two.pages().get(0);
        PageDto p2 = two.pages().get(1);
        assertThat(p2.mediaUrl()).isEqualTo(p1.mediaUrl());

        List<PageDto> after = service.rotatePage(c.id(), p1.id(), RotateDirection.RIGHT);

        assertThat(after.get(1).mediaUrl()).isEqualTo(p2.mediaUrl());
        assertThat(after.get(0).mediaUrl()).isNotEqualTo(p2.mediaUrl());
        assertThat(after.get(1).landscape()).isTrue();
        long oldId = Long.parseLong(p2.mediaUrl().substring("/api/media/".length()));
        assertThat(mediaService.load(oldId).path()).exists();
    }

    @Test
    void rotatePagesRotatesEveryPage() {
        ChapterDetail c = landscapeChapter(1, 3);

        List<PageDto> after = service.rotatePages(c.id(), RotateDirection.LEFT);

        assertThat(after).hasSize(3).allMatch(p -> !p.landscape());
    }

    @Test
    void detailFlagsSuspectPage() {
        ChapterDetail c = chapterWithPages(1, "a.png", "b.png", "c.png", "d.png", "e.png", "f.png");
        String source = "ก".repeat(200);
        List<ChapterPage> ps = pageRepository.findByChapterIdOrderByPosition(c.id());
        for (int i = 0; i < ps.size(); i++) {
            ps.get(i).setSourceTh(source);
            ps.get(i).setTextVi("a".repeat(i == 5 ? 80 : 200));
        }
        pageRepository.flush();

        List<PageDto> dtos = service.get(c.id()).pages();

        assertThat(dtos).extracting(PageDto::suspect).containsExactly(false, false, false, false, false, true);
        assertThat(dtos.get(5).source()).isEqualTo(source);
    }

    private long wattpadChapter(int no, String partId) {
        return service.addFromSource(novel.getId(), "Part " + no, "Original text " + no, partId, NOW);
    }

    @Test
    void addFromSourceAppendsADraftChapterWithTheOriginalText() {
        service.add(novel.getId(), new ChapterRequest(null, "Existing"));

        long id = service.addFromSource(novel.getId(), " Chapter 1: Cold Brew ", "Line one.\n\nLine two.", "1552",
                NOW);

        ChapterDetail d = service.get(id);
        assertThat(d.chapterNo()).isEqualTo(2);
        assertThat(d.title()).isEqualTo("Chapter 1: Cold Brew");
        assertThat(d.sourceText()).isEqualTo("Line one.\n\nLine two.");
        assertThat(d.wattpadPartId()).isEqualTo("1552");
        assertThat(d.sourceFetchedAt()).isEqualTo(NOW);
        assertThat(d.publishStatus()).isEqualTo(ChapterPublishStatus.DRAFT);
        assertThat(d.pages()).isEmpty();
        assertThat(chapters.findByNovelIdOrderBySortOrderAscChapterNoAsc(novel.getId()))
                .extracting(Chapter::getChapterNo).containsExactly(1, 2);
    }

    @Test
    void addFromSourceCutsALongTitle() {
        long id = service.addFromSource(novel.getId(), "x".repeat(300), "Text", "9", NOW);

        assertThat(service.get(id).title()).hasSize(200);
    }

    @Test
    void pageEndpointsAreRefusedForATextChapter() {
        long id = wattpadChapter(1, "11");

        assertThatThrownBy(() -> service.addPages(id, List.of(img("a.png"))))
                .isInstanceOf(ChapterTextSourceException.class);
        assertThatThrownBy(() -> service.reorder(id, new PageOrderRequest(List.of())))
                .isInstanceOf(ChapterTextSourceException.class);
        assertThatThrownBy(() -> service.deletePage(id, 1L)).isInstanceOf(ChapterTextSourceException.class);
        assertThatThrownBy(() -> service.rotatePage(id, 1L, RotateDirection.LEFT))
                .isInstanceOf(ChapterTextSourceException.class);
        assertThatThrownBy(() -> service.rotatePages(id, RotateDirection.LEFT))
                .isInstanceOf(ChapterTextSourceException.class);
        assertThatThrownBy(() -> service.update(id, new ChapterUpdateRequest(null, null,
                List.of(new PageTextEdit(5L, "x")), null))).isInstanceOf(ChapterTextSourceException.class);
    }

    @Test
    void aTextChapterStillTakesTitleAndTextEdits() {
        long id = wattpadChapter(1, "11");

        ChapterDetail d = service.update(id, new ChapterUpdateRequest(null, "New title", null, "Bản dịch"));

        assertThat(d.title()).isEqualTo("New title");
        assertThat(d.text()).isEqualTo("Bản dịch");
        assertThat(d.sourceText()).isEqualTo("Original text 1");
    }

    @Test
    void replaceSourceTextKeepsTheTranslation() {
        long id = wattpadChapter(1, "11");
        service.update(id, new ChapterUpdateRequest(null, null, null, "Bản dịch"));

        ChapterDetail d = service.replaceSourceText(id, "Fresh original", NOW.plusSeconds(60));

        assertThat(d.sourceText()).isEqualTo("Fresh original");
        assertThat(d.sourceFetchedAt()).isEqualTo(NOW.plusSeconds(60));
        assertThat(d.text()).isEqualTo("Bản dịch");
    }

    @Test
    void reloadIsRefusedForPublishedTranslatingAndScreenshotChapters() {
        long published = wattpadChapter(1, "11");
        setStatus(published, ChapterTranslationStatus.TRANSLATED, ChapterPublishStatus.PUBLISHED);
        long translating = wattpadChapter(2, "12");
        setStatus(translating, ChapterTranslationStatus.TRANSLATING, ChapterPublishStatus.DRAFT);
        long screenshots = service.add(novel.getId(), new ChapterRequest(null, null)).id();

        assertThatThrownBy(() -> service.reloadablePartId(published)).isInstanceOf(ChapterPublishedException.class);
        assertThatThrownBy(() -> service.replaceSourceText(published, "x", NOW))
                .isInstanceOf(ChapterPublishedException.class);
        assertThatThrownBy(() -> service.reloadablePartId(translating))
                .isInstanceOf(ChapterTranslationInProgressException.class);
        assertThatThrownBy(() -> service.reloadablePartId(screenshots)).isInstanceOf(InvalidChapterException.class);
        assertThat(service.get(published).sourceText()).isEqualTo("Original text 1");
    }

    @Test
    void reloadablePartIdIsTheWattpadPart() {
        assertThat(service.reloadablePartId(wattpadChapter(1, "777"))).isEqualTo("777");
    }

    @Test
    void detailFlagsAChapterTranslatedByAFallbackModel() {
        ChapterDetail c = service.add(novel.getId(), new ChapterRequest(1, null));
        Chapter row = chapters.findById(c.id()).orElseThrow();
        row.setTranslationStatus(ChapterTranslationStatus.TRANSLATED);

        row.setTranslationModel("m");
        chapters.saveAndFlush(row);
        assertThat(service.get(c.id()).translatedByFallback()).isFalse();

        row.setTranslationModel("m, gemini-lite");
        chapters.saveAndFlush(row);
        assertThat(service.get(c.id()).translatedByFallback()).isTrue();

        row.setTranslationModel(null);
        chapters.saveAndFlush(row);
        assertThat(service.get(c.id()).translatedByFallback()).isFalse();
    }
}
