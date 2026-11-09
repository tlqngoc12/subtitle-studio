package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.profile.ImageSniffer;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.translate.GeminiNotConfiguredException;
import com.subtitlestudio.translate.PromptProfileStore;
import com.subtitlestudio.translate.TranslationFailedException;
import com.subtitlestudio.translate.UnknownProfileException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({com.subtitlestudio.novel.render.NovelRenderConfig.class, ChapterTranslationService.class, ChapterService.class, TranslatingModels.class, PageRotator.class, MediaService.class, ImageSniffer.class,
    PromptProfileStore.class, NovelProfileStore.class, PageImagePreparer.class, ChapterTranslationServiceTest.Config.class})
class ChapterTranslationServiceTest {

    static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    @TempDir
    static Path dataDir;

    /** Replies "T{page} xxx…" ({@code length} chars) for each page; can fail or run an action on a given call. */
    static class FakeTranslator implements ChapterTranslator {
        final List<ChapterPrompt> prompts = new ArrayList<>();
        int length = 3_000;
        int failOnCall = -1;
        /** With {@link #failOnCall}: that call fails after translating this many of its pages (-1 = none). */
        int partlyDone = -1;
        Runnable beforeReturn;
        boolean omitSource;
        /** Model reported through onTrying by call n (1-based); null = none reported. */
        List<String> modelByCall;

        @Override
        public List<TranslatedPage> translate(ChapterPrompt prompt) {
            return translate(prompt, m -> {});
        }

        @Override
        public List<TranslatedPage> translate(ChapterPrompt prompt, java.util.function.Consumer<String> onTrying) {
            prompts.add(prompt);
            if (modelByCall != null && prompts.size() <= modelByCall.size()) {
                onTrying.accept(modelByCall.get(prompts.size() - 1));
            }
            if (prompts.size() == failOnCall && partlyDone >= 0) {
                throw new ChapterPartlyTranslatedException("Gemini free quota is used up, try again later.",
                        prompt.pages().stream().limit(partlyDone)
                                .map(p -> new TranslatedPage(p.page(), pad("T" + p.page() + " "), "S" + p.page())).toList());
            }
            if (prompts.size() == failOnCall) {
                throw new TranslationFailedException(
                        "Gemini is busy right now (high demand), try again in a few minutes.");
            }
            if (beforeReturn != null) {
                beforeReturn.run();
            }
            return prompt.pages().stream()
                    .map(p -> new TranslatedPage(p.page(), pad("T" + p.page() + " "), omitSource ? null : "S" + p.page()))
                    .toList();
        }

        private String pad(String s) {
            return s + "x".repeat(Math.max(0, length - s.length()));
        }
    }

    static class RecordingScheduler implements NotebookScheduler {
        final List<String> calls = new ArrayList<>();

        @Override
        public void scheduleUpdate(long novelId, int chapterNo) {
            calls.add(novelId + ":" + chapterNo);
        }
    }

    static class FakeNotebookSource implements NotebookPromptSource {
        final List<String> asked = new ArrayList<>();

        @Override
        public String textBefore(long novelId, int chapterNo) {
            asked.add(novelId + ":" + chapterNo);
            return "## Nhân vật\nA";
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }

        @Bean
        FakeTranslator translator() {
            return new FakeTranslator();
        }

        @Bean
        @Primary
        RecordingScheduler scheduler() {
            return new RecordingScheduler();
        }

        @Bean
        @Primary
        FakeNotebookSource notebookSource() {
            return new FakeNotebookSource();
        }

        @Bean(name = "translationExecutor")
        Executor translationExecutor() {
            return Runnable::run;
        }

        @Bean
        SubtitleStudioProperties properties() {
            return propertiesWithKey("key");
        }
    }

    static SubtitleStudioProperties propertiesWithKey(String apiKey) {
        return new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir,
                new SubtitleStudioProperties.Gemini(apiKey, "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                        List.of()),
                new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
    }

    @BeforeAll
    static void profiles() throws IOException {
        Files.createDirectories(dataDir.resolve("prompts/novels"));
        Files.writeString(dataDir.resolve("prompts/novels/SummerLove.md"), "Ngôn ngữ gốc: tiếng Thái");
    }

    @Autowired
    private ChapterTranslationService service;

    @Autowired
    private ChapterService chapterService;

    @Autowired
    private TranslatingModels models;

    @Autowired
    private NovelRepository novels;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private ChapterPageRepository pages;

    @Autowired
    private FakeTranslator translator;

    @Autowired
    private RecordingScheduler scheduler;

    @Autowired
    private FakeNotebookSource notebookSource;

    @Autowired
    private NovelProfileStore profiles;

    @Autowired
    private MediaService mediaService;

    @Autowired
    private PageImagePreparer preparer;

    @Autowired
    private TransactionTemplate tx;

    @Autowired
    private MutableClock clock;

    private Novel novel;

    @BeforeEach
    void setUp() {
        translator.prompts.clear();
        translator.length = 3_000;
        translator.failOnCall = -1;
        translator.partlyDone = -1;
        translator.beforeReturn = null;
        translator.omitSource = false;
        translator.modelByCall = null;
        scheduler.calls.clear();
        notebookSource.asked.clear();
        Novel n = new Novel("n", "Tình Yêu", NovelStatus.ONGOING, NOW);
        n.setPromptProfile("SummerLove");
        novel = novels.save(n);
    }

    private ChapterDetail chapter(int no, int pageCount) {
        ChapterDetail c = chapterService.add(novel.getId(), new ChapterRequest(no, null));
        if (pageCount > 0) {
            chapterService.addPages(c.id(), IntStream.rangeClosed(1, pageCount)
                    .mapToObj(i -> new NamedImage("p" + i + ".png", TestImages.png())).toList());
        }
        return chapterService.get(c.id());
    }

    private void setTexts(long chapterId, String text) {
        pages.findByChapterIdOrderByPosition(chapterId).forEach(p -> p.setTextVi(text));
        pages.flush();
    }

    private Chapter reload(long id) {
        return chapters.findById(id).orElseThrow();
    }

    @Test
    void geminiNotConfiguredComesFirst() {
        ChapterTranslationService off = new ChapterTranslationService(propertiesWithKey(""), profiles, translator, preparer,
                mediaService, chapters, pages, notebookSource, scheduler, chapterService, tx, Runnable::run,
                clock);

        assertThatThrownBy(() -> off.start(chapter(1, 0).id())).isInstanceOf(GeminiNotConfiguredException.class);
    }

    @Test
    void checksInOrder() {
        novel.setPromptProfile(null);
        ChapterDetail empty = chapter(1, 0);
        assertThatThrownBy(() -> service.start(empty.id())).isInstanceOf(UnknownProfileException.class);
        novel.setPromptProfile("Gone");
        assertThatThrownBy(() -> service.start(empty.id())).isInstanceOf(UnknownProfileException.class);
        novel.setPromptProfile("SummerLove");
        assertThatThrownBy(() -> service.start(empty.id())).isInstanceOf(ChapterHasNoPagesException.class);

        ChapterDetail c = chapter(2, 1);
        reload(c.id()).setTranslationStatus(ChapterTranslationStatus.TRANSLATING);
        assertThatThrownBy(() -> service.start(c.id())).isInstanceOf(ChapterTranslationInProgressException.class);
        assertThatThrownBy(() -> service.start(999)).isInstanceOf(ChapterNotFoundException.class);
    }

    @Test
    void showsTheModelBeingTriedWhileTranslatingAndStoresItAfterwards() {
        ChapterDetail c = chapter(1, 2);
        translator.modelByCall = List.of("gemini-x");
        String[] during = {"unset"};
        translator.beforeReturn = () -> during[0] = chapterService.get(c.id()).translationModel();

        service.start(c.id());

        assertThat(during[0]).isEqualTo("gemini-x");
        assertThat(chapterService.get(c.id()).translationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
        assertThat(chapterService.get(c.id()).translationModel()).isEqualTo("gemini-x");
        assertThat(reload(c.id()).getTranslationModel()).isEqualTo("gemini-x");
        assertThat(models.get(c.id())).isNull();
    }

    @Test
    void storesTheDistinctModelsOfAllBatchesInOrder() {
        ChapterDetail c = chapter(1, 25);
        translator.modelByCall = List.of("a", "b");

        service.start(c.id());
        assertThat(reload(c.id()).getTranslationModel()).isEqualTo("a, b");

        ChapterDetail same = chapter(2, 25);
        translator.prompts.clear();
        translator.modelByCall = List.of("a", "a");
        service.start(same.id());
        assertThat(reload(same.id()).getTranslationModel()).isEqualTo("a");
    }

    @Test
    void failureKeepsTheStoredModelAndClearsTheActiveOne() {
        ChapterDetail c = chapter(1, 3);
        translator.modelByCall = List.of("old");
        service.start(c.id());
        assertThat(reload(c.id()).getTranslationModel()).isEqualTo("old");

        translator.prompts.clear();
        translator.modelByCall = List.of("new");
        translator.failOnCall = 1;
        String[] during = {"unset"};
        translator.beforeReturn = () -> during[0] = "not reached";
        service.start(c.id());

        Chapter failed = reload(c.id());
        assertThat(failed.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.FAILED);
        assertThat(failed.getTranslationModel()).isEqualTo("old");
        assertThat(models.get(c.id())).isNull();
        assertThat(chapterService.get(c.id()).translationModel()).isEqualTo("old");
    }

    @Test
    void translatesInBatchesWithCarryOver() {
        ChapterDetail c = chapter(1, 45);

        ChapterDetail started = service.start(c.id());

        assertThat(started.translationStatus()).isIn(ChapterTranslationStatus.TRANSLATING,
                ChapterTranslationStatus.TRANSLATED);
        assertThat(translator.prompts).hasSize(3);
        assertThat(translator.prompts.get(0).pages()).hasSize(20);
        assertThat(translator.prompts.get(0).carryOver()).isNull();
        assertThat(translator.prompts.get(1).carryOver()).hasSize(2_000).endsWith("x");
        assertThat(translator.prompts.get(2).pages()).extracting(PageImage::page).startsWith(41).endsWith(45);
        assertThat(translator.prompts.get(0).profile()).isEqualTo("Ngôn ngữ gốc: tiếng Thái");
        assertThat(translator.prompts.get(0).novelTitle()).isEqualTo("Tình Yêu");
        Chapter done = reload(c.id());
        assertThat(done.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
        assertThat(done.getTranslatedAt()).isEqualTo(NOW);
        assertThat(done.isEditedAfterTranslation()).isFalse();
        List<ChapterPage> result = pages.findByChapterIdOrderByPosition(c.id());
        assertThat(result.getFirst().getTextVi()).startsWith("T1 ");
        assertThat(result.get(44).getTextVi()).startsWith("T45 ");
    }

    @Test
    void usesNotebookBeforeAndPreviousChapterText() {
        ChapterDetail two = chapter(2, 1);
        setTexts(two.id(), "Bản nháp chương hai");
        ChapterDetail three = chapter(3, 1);

        service.start(three.id());

        assertThat(notebookSource.asked).containsExactly(novel.getId() + ":3");
        assertThat(translator.prompts.getFirst().notebookText()).isEqualTo("## Nhân vật\nA");
        assertThat(translator.prompts.getFirst().previousText()).isEqualTo("Bản nháp chương hai");
        assertThat(translator.prompts.getFirst().chapterNo()).isEqualTo(3);
    }

    @Test
    void previousChapterNeedsEveryPageTranslated() {
        ChapterDetail one = chapter(1, 1);
        setTexts(one.id(), "Chương một");
        chapter(2, 2);
        ChapterDetail three = chapter(3, 1);

        service.start(three.id());

        assertThat(translator.prompts.getFirst().previousText()).isEqualTo("Chương một");
    }

    @Test
    void previousTextIsTail4000() {
        ChapterDetail one = chapter(1, 1);
        setTexts(one.id(), "a".repeat(5_000) + "b".repeat(4_000));
        ChapterDetail two = chapter(2, 1);

        service.start(two.id());

        assertThat(translator.prompts.getFirst().previousText()).isEqualTo("b".repeat(4_000));
    }

    @Test
    void failureKeepsTheBatchesAlreadyTranslatedAndOldTextOfTheRest() {
        ChapterDetail c = chapter(1, 25);
        setTexts(c.id(), "cũ");
        translator.failOnCall = 2;

        service.start(c.id());

        Chapter failed = reload(c.id());
        assertThat(failed.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.FAILED);
        assertThat(failed.getTranslationError())
                .isEqualTo("Gemini is busy right now (high demand), try again in a few minutes.");
        List<ChapterPage> after = pages.findByChapterIdOrderByPosition(c.id());
        assertThat(after.subList(0, 20)).extracting(ChapterPage::getTextVi).allMatch(t -> t.startsWith("T"));
        assertThat(after.subList(20, 25)).extracting(ChapterPage::getTextVi).containsOnly("cũ");
    }

    @Test
    void partlyTranslatedPagesAreSavedAndTranslateAgainSendsOnlyTheRest() {
        ChapterDetail c = chapter(1, 3);
        translator.failOnCall = 1;
        translator.partlyDone = 2;

        service.start(c.id());

        Chapter failed = reload(c.id());
        assertThat(failed.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.FAILED);
        assertThat(failed.getTranslationError()).isEqualTo("Gemini free quota is used up, try again later. "
                + "2 of 3 pages are translated; Translate again does only the missing ones.");
        assertThat(pages.findByChapterIdOrderByPosition(c.id())).extracting(ChapterPage::getTextVi)
                .satisfiesExactly(t -> assertThat(t).startsWith("T1 "), t -> assertThat(t).startsWith("T2 "),
                        t -> assertThat(t).isNull());

        service.start(c.id());

        ChapterPrompt again = translator.prompts.getLast();
        assertThat(again.pages()).extracting(PageImage::page).containsExactly(3);
        assertThat(again.carryOver()).hasSize(2_000).endsWith("x");
        assertThat(reload(c.id()).getTranslationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
        assertThat(pages.findByChapterIdOrderByPosition(c.id())).extracting(ChapterPage::getTextVi)
                .satisfiesExactly(t -> assertThat(t).startsWith("T1 "), t -> assertThat(t).startsWith("T2 "),
                        t -> assertThat(t).startsWith("T3 "));
    }

    @Test
    void translatedChapterIsTranslatedWhole() {
        ChapterDetail c = chapter(1, 3);
        setTexts(c.id(), "cũ");
        reload(c.id()).setTranslationStatus(ChapterTranslationStatus.FAILED);
        chapters.flush();

        service.start(c.id());

        assertThat(translator.prompts.getFirst().pages()).extracting(PageImage::page).containsExactly(1, 2, 3);
    }

    @Test
    void publishedChapterCannotBeTranslatedAgain() {
        ChapterDetail c = chapter(4, 1);
        reload(c.id()).setPublishStatus(ChapterPublishStatus.PUBLISHED);

        assertThatThrownBy(() -> service.start(c.id())).isInstanceOf(ChapterPublishedException.class);
        assertThat(translator.prompts).isEmpty();
        assertThat(reload(c.id()).getTranslationStatus()).isEqualTo(ChapterTranslationStatus.NONE);
    }

    @Test
    void draftTranslationDoesNotScheduleNotebook() {
        service.start(chapter(1, 1).id());

        assertThat(scheduler.calls).isEmpty();
    }

    @Test
    void restartMarksInterrupted() {
        ChapterDetail c = chapter(1, 1);
        reload(c.id()).setTranslationStatus(ChapterTranslationStatus.TRANSLATING);
        chapters.flush();

        service.markInterrupted();

        Chapter after = reload(c.id());
        assertThat(after.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.FAILED);
        assertThat(after.getTranslationError()).isEqualTo("Translation was interrupted.");
    }

    @Test
    void chapterDeletedMidTranslationEndsQuietly() {
        ChapterDetail c = chapter(1, 2);
        translator.beforeReturn = () -> {
            pages.deleteAll(pages.findByChapterIdOrderByPosition(c.id()));
            chapters.deleteById(c.id());
            chapters.flush();
        };

        service.start(c.id());

        assertThat(chapters.findById(c.id())).isEmpty();
        assertThat(pages.findByChapterIdOrderByPosition(c.id())).isEmpty();
    }

    @Test
    void publishAcceptsWholeChapterText() {
        ChapterDetail c = chapter(2, 2);
        reload(c.id()).setTextVi("Cả chương");

        assertThat(service.publish(c.id()).publishStatus()).isEqualTo(ChapterPublishStatus.PUBLISHED);
    }

    @Test
    void translatingReplacesTheWholeChapterText() {
        ChapterDetail c = chapter(1, 1);
        reload(c.id()).setTextVi("Bản sửa cũ");

        service.start(c.id());

        assertThat(reload(c.id()).getTextVi()).isNull();
        assertThat(chapterService.get(c.id()).text()).startsWith("T1 ");
    }

    @Test
    void previousTextUsesTheWholeChapterText() {
        ChapterDetail one = chapter(1, 1);
        reload(one.id()).setTextVi("Bản sửa chương một");
        ChapterDetail two = chapter(2, 1);

        service.start(two.id());

        assertThat(translator.prompts.getFirst().previousText()).isEqualTo("Bản sửa chương một");
    }

    @Test
    void publishRequiresAllPagesTranslated() {
        ChapterDetail empty = chapter(1, 0);
        assertThatThrownBy(() -> service.publish(empty.id())).isInstanceOf(ChapterNotTranslatedException.class);

        ChapterDetail c = chapter(2, 2);
        pages.findByChapterIdOrderByPosition(c.id()).getFirst().setTextVi("Một");
        assertThatThrownBy(() -> service.publish(c.id())).isInstanceOf(ChapterNotTranslatedException.class);
        assertThat(scheduler.calls).isEmpty();
    }

    @Test
    void publishSchedulesNotebook() {
        ChapterDetail c = chapter(3, 2);
        setTexts(c.id(), "Xong");

        ChapterDetail published = service.publish(c.id());

        assertThat(published.publishStatus()).isEqualTo(ChapterPublishStatus.PUBLISHED);
        assertThat(reload(c.id()).getPublishedAt()).isEqualTo(NOW);
        assertThat(scheduler.calls).containsExactly(novel.getId() + ":3");
    }

    @Test
    void publishWhileTranslatingIsBlocked() {
        ChapterDetail c = chapter(1, 1);
        setTexts(c.id(), "Xong");
        reload(c.id()).setTranslationStatus(ChapterTranslationStatus.TRANSLATING);

        assertThatThrownBy(() -> service.publish(c.id())).isInstanceOf(ChapterTranslationInProgressException.class);
    }

    @Test
    void unpublishKeepsNotebook() {
        ChapterDetail c = chapter(3, 1);
        setTexts(c.id(), "Xong");
        service.publish(c.id());
        scheduler.calls.clear();

        ChapterDetail draft = service.unpublish(c.id());

        assertThat(draft.publishStatus()).isEqualTo(ChapterPublishStatus.DRAFT);
        assertThat(scheduler.calls).isEmpty();
    }

    @Test
    void savesSource() {
        ChapterDetail c = chapter(1, 2);

        service.start(c.id());

        assertThat(pages.findByChapterIdOrderByPosition(c.id())).extracting(ChapterPage::getSourceTh)
                .containsExactly("S1", "S2");
    }

    @Test
    void resumeKeepsSourceOfKeptPages() {
        ChapterDetail c = chapter(1, 2);
        ChapterPage first = pages.findByChapterIdOrderByPosition(c.id()).getFirst();
        first.setTextVi("giữ");
        first.setSourceTh("nguồn cũ");
        reload(c.id()).setTranslationStatus(ChapterTranslationStatus.FAILED);
        pages.flush();

        service.start(c.id());

        assertThat(translator.prompts.getLast().pages()).extracting(PageImage::page).containsExactly(2);
        assertThat(pages.findByChapterIdOrderByPosition(c.id())).extracting(ChapterPage::getSourceTh)
                .containsExactly("nguồn cũ", "S2");
    }

    @Test
    void translatingAgainReplacesAStaleSourceEvenWhenGeminiSendsNone() {
        ChapterDetail c = chapter(1, 1);
        ChapterPage only = pages.findByChapterIdOrderByPosition(c.id()).getFirst();
        only.setTextVi("cũ");
        only.setSourceTh("nguồn cũ");
        pages.flush();
        translator.omitSource = true;

        service.start(c.id());

        assertThat(pages.findByChapterIdOrderByPosition(c.id()).getFirst().getSourceTh()).isNull();
    }
}
