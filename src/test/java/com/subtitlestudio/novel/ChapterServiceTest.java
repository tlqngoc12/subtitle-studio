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
@Import({com.subtitlestudio.novel.render.NovelRenderConfig.class, ChapterService.class, MediaService.class, ImageSniffer.class, ChapterServiceTest.Config.class})
class ChapterServiceTest {

    static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    @TempDir
    static Path dataDir;

    /** Records scheduled notebook updates instead of running them. */
    static class RecordingScheduler implements NotebookScheduler {
        final List<String> calls = new ArrayList<>();

        @Override
        public void scheduleUpdate(long novelId, int chapterNo) {
            calls.add(novelId + ":" + chapterNo);
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }

        @Bean
        RecordingScheduler scheduler() {
            return new RecordingScheduler();
        }

        @Bean
        SubtitleStudioProperties properties() {
            return new SubtitleStudioProperties(
                    new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir,
                    new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                            List.of()),
                    new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)),
                    new SubtitleStudioProperties.Novel(20, DataSize.ofKilobytes(200), null, ""));
        }
    }

    @Autowired
    private ChapterService service;

    @Autowired
    private NovelRepository novels;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private NovelNotebookRepository notebooks;

    @Autowired
    private RecordingScheduler scheduler;

    @Autowired
    private TestEntityManager em;

    private Novel novel;

    @BeforeEach
    void setUp() {
        scheduler.calls.clear();
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
    void renumberKeepsNotebookLookupByNewNumber() {
        ChapterDetail five = service.add(novel.getId(), new ChapterRequest(5, null));
        notebooks.save(new NovelNotebook(novel, 5, "{}", NOW));

        service.update(five.id(), new ChapterUpdateRequest(7, "Bảy", null));

        assertThat(service.get(five.id()).chapterNo()).isEqualTo(7);
        assertThat(notebooks.findTopByNovelIdAndAfterChapterNoLessThanOrderByAfterChapterNoDesc(novel.getId(), 8))
                .map(NovelNotebook::getAfterChapterNo).contains(5);
    }

    @Test
    void uploadAppendsInNaturalOrder() {
        ChapterDetail c = chapterWithPages(1, "p1.png", "p2.png");

        List<PageDto> pages = service.addPages(c.id(), List.of(img("p10.png"), img("p9.png")));

        assertThat(pages).extracting(PageDto::position).containsExactly(1, 2, 3, 4);
        assertThat(pages.get(2).id()).isLessThan(pages.get(3).id());
        assertThat(pages.get(0).mediaUrl()).startsWith("/api/media/");
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
        assertThat(scheduler.calls).isEmpty();
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
    void editingPublishedTextDoesNotUpdateTheNotebook() {
        ChapterDetail c = chapterWithPages(4, "a.png");
        setStatus(c.id(), ChapterTranslationStatus.TRANSLATED, ChapterPublishStatus.PUBLISHED);

        service.update(c.id(), new ChapterUpdateRequest(null, null,
                List.of(new PageTextEdit(c.pages().getFirst().id(), "Mới"))));
        service.update(c.id(), new ChapterUpdateRequest(null, null, null, "Bản sửa"));

        assertThat(scheduler.calls).isEmpty();
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
        assertThat(scheduler.calls).isEmpty();
    }

    @Test
    void prevNextIdsFollowChapterNumbers() {
        ChapterDetail one = service.add(novel.getId(), new ChapterRequest(1, null));
        ChapterDetail five = service.add(novel.getId(), new ChapterRequest(5, null));
        ChapterDetail three = service.add(novel.getId(), new ChapterRequest(3, null));

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
}
