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
@Import({com.subtitlestudio.novel.render.NovelRenderConfig.class, ChapterTranslationService.class, TextChapterTranslation.class, ChapterService.class, TranslatingModels.class, PageRotator.class, MediaService.class, com.subtitlestudio.profile.MediaStorage.class, com.subtitlestudio.profile.MediaFiler.class, ImageSniffer.class, com.subtitlestudio.profile.ImageResizer.class,
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

    /** Replies "VI: <source>" for each text request; can fail, or be cut off, on a given call. */
    static class FakeTextTranslator implements TextChapterTranslator {
        final List<TextChapterPrompt> prompts = new ArrayList<>();
        int failOnCall = -1;
        String model = "text-model";

        @Override
        public TextAnswer translate(TextChapterPrompt prompt, java.util.function.Consumer<String> onTrying) {
            prompts.add(prompt);
            onTrying.accept(model);
            if (prompts.size() == failOnCall) {
                throw new TranslationFailedException("Gemini free quota is used up, try again later.");
            }
            return new TextAnswer("VI: " + prompt.sourceText(), model);
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
        FakeTextTranslator textTranslator() {
            return new FakeTextTranslator();
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
    private FakeTextTranslator textTranslator;

    @Autowired
    private TextChapterTranslation textTranslation;

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
        textTranslator.prompts.clear();
        textTranslator.failOnCall = -1;
        translator.length = 3_000;
        translator.failOnCall = -1;
        translator.partlyDone = -1;
        translator.beforeReturn = null;
        translator.omitSource = false;
        translator.modelByCall = null;
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
        ChapterTranslationService off = new ChapterTranslationService(propertiesWithKey(""), profiles, translator, textTranslation, preparer,
                mediaService, chapters, pages, chapterService, tx, Runnable::run,
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
    void usesPreviousChapterText() {
        ChapterDetail two = chapter(2, 1);
        setTexts(two.id(), "Bản nháp chương hai");
        ChapterDetail three = chapter(3, 1);

        service.start(three.id());

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
    }

    @Test
    void publishMarksChapterPublished() {
        ChapterDetail c = chapter(3, 2);
        setTexts(c.id(), "Xong");

        ChapterDetail published = service.publish(c.id());

        assertThat(published.publishStatus()).isEqualTo(ChapterPublishStatus.PUBLISHED);
        assertThat(reload(c.id()).getPublishedAt()).isEqualTo(NOW);
    }

    private ChapterDetail failedChapter(boolean published) {
        ChapterDetail c = chapter(1, 1);
        setTexts(c.id(), "Tự viết");
        Chapter ch = reload(c.id());
        ch.setTranslationStatus(ChapterTranslationStatus.FAILED);
        ch.setTranslationError("Gemini failed");
        if (published) {
            ch.setPublishStatus(ChapterPublishStatus.PUBLISHED);
        }
        return c;
    }

    @Test
    void publishing_a_failed_chapter_clears_the_error_and_marks_it_translated() {
        ChapterDetail c = failedChapter(false);

        service.publish(c.id());

        Chapter ch = reload(c.id());
        assertThat(ch.getPublishStatus()).isEqualTo(ChapterPublishStatus.PUBLISHED);
        assertThat(ch.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
        assertThat(ch.getTranslationError()).isNull();
    }

    @Test
    void republishing_a_failed_published_chapter_cleans_it() {
        ChapterDetail c = failedChapter(true);

        service.publish(c.id());

        Chapter ch = reload(c.id());
        assertThat(ch.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
        assertThat(ch.getTranslationError()).isNull();
    }

    @Test
    void a_failed_draft_chapter_keeps_its_error() {
        ChapterDetail c = failedChapter(false);

        service.unpublish(c.id());

        Chapter still = reload(c.id());
        assertThat(still.getPublishStatus()).isEqualTo(ChapterPublishStatus.DRAFT);
        assertThat(still.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.FAILED);
        assertThat(still.getTranslationError()).isEqualTo("Gemini failed");
    }

    @Test
    void publishWhileTranslatingIsBlocked() {
        ChapterDetail c = chapter(1, 1);
        setTexts(c.id(), "Xong");
        reload(c.id()).setTranslationStatus(ChapterTranslationStatus.TRANSLATING);

        assertThatThrownBy(() -> service.publish(c.id())).isInstanceOf(ChapterTranslationInProgressException.class);
    }

    @Test
    void unpublishReturnsToDraft() {
        ChapterDetail c = chapter(3, 1);
        setTexts(c.id(), "Xong");
        service.publish(c.id());

        ChapterDetail draft = service.unpublish(c.id());

        assertThat(draft.publishStatus()).isEqualTo(ChapterPublishStatus.DRAFT);
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
    void runThatNoModelAnsweredKeepsTheStoredModel() {
        ChapterDetail c = chapter(1, 2);
        Chapter stored = reload(c.id());
        stored.setTranslationModel("old-model");
        pages.flush();
        translator.modelByCall = null; // the translator never reports a model

        service.start(c.id());

        assertThat(reload(c.id()).getTranslationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
        assertThat(reload(c.id()).getTranslationModel()).isEqualTo("old-model");
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

    // ---- Wattpad (text) chapters ----

    private long textChapter(int no, String source) {
        return chapterService.addFromSource(novel.getId(), "Part " + no, source, "part-" + no, NOW);
    }

    @Test
    void aTextChapterIsTranslatedWholeInOneRequest() {
        novel.setSourceLanguage("en");
        long id = textChapter(1, "First.\n\nSecond.");

        ChapterDetail started = service.start(id);

        assertThat(started.translationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATING);
        Chapter c = reload(id);
        assertThat(c.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
        assertThat(c.getTextVi()).isEqualTo("VI: First.\n\nSecond.");
        assertThat(c.getTranslationModel()).isEqualTo("text-model");
        assertThat(c.isEditedAfterTranslation()).isFalse();
        assertThat(c.getTranslationError()).isNull();
        assertThat(c.getSourceText()).isEqualTo("First.\n\nSecond.");
        assertThat(textTranslator.prompts).hasSize(1);
        TextChapterPrompt prompt = textTranslator.prompts.getFirst();
        assertThat(prompt.sourceLanguage()).isEqualTo("en");
        assertThat(prompt.novelTitle()).isEqualTo("Tình Yêu");
        assertThat(prompt.profile()).contains("Ngôn ngữ gốc");
        assertThat(translator.prompts).isEmpty();
    }

    private long chapterWithImages(int no, int imageCount) {
        List<String> paragraphs = new ArrayList<>();
        List<ChapterImageLink> links = new ArrayList<>();
        for (int i = 1; i <= imageCount; i++) {
            long mediaId = mediaService.store("i" + i + ".png", TestImages.png()).getId();
            paragraphs.add("Paragraph " + i + ".");
            paragraphs.add(ImageMarkers.marker(mediaId));
            links.add(new ChapterImageLink(mediaId, "https://img.wattpad.com/" + no + "/" + i + ".png"));
        }
        return chapterService.addFromSource(novel.getId(), "Part " + no, String.join("\n\n", paragraphs),
                "part-" + no, NOW, links);
    }

    @Test
    void aChapterWithImagesSendsThemShrunkAndInMarkerOrder() {
        novel.setSourceLanguage("en");
        long id = chapterWithImages(1, 3);

        service.start(id);

        assertThat(reload(id).getTranslationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
        TextChapterPrompt prompt = textTranslator.prompts.getFirst();
        assertThat(prompt.images()).extracting(PromptImage::mediaId)
                .containsExactlyElementsOf(ImageMarkers.ids(prompt.sourceText()));
        assertThat(prompt.images()).hasSize(3).allSatisfy(i -> {
            assertThat(i.mimeType()).isEqualTo("image/jpeg");
            assertThat(i.bytes()).isNotEmpty();
        });
        assertThat(reload(id).getTextVi()).isEqualTo("VI: " + reload(id).getSourceText());
    }

    @Test
    void moreThanTwentyImagesAreSplitIntoRequestsOfAtMostTwenty() {
        novel.setSourceLanguage("en");
        long id = chapterWithImages(1, 25);

        service.start(id);

        assertThat(reload(id).getTranslationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
        assertThat(textTranslator.prompts).hasSize(2);
        assertThat(textTranslator.prompts).allSatisfy(p -> assertThat(p.images().size()).isLessThanOrEqualTo(20));
    }

    @Test
    void anImageThatIsGoneFailsTheTranslationWithAClearMessage() {
        novel.setSourceLanguage("en");
        long id = textChapter(1, "Text.\n\n[[image:999999]]");

        service.start(id);

        Chapter c = reload(id);
        assertThat(c.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.FAILED);
        assertThat(c.getTranslationError()).contains("image of this chapter is missing");
        assertThat(textTranslator.prompts).isEmpty();
    }

    @Test
    void thePreviousChapterContextHasNoImageMarkers() {
        novel.setSourceLanguage("en");
        service.start(chapterWithImages(1, 2));
        long second = textChapter(2, "Two");

        service.start(second);

        String previous = textTranslator.prompts.get(1).previousText();
        assertThat(previous).contains("Paragraph 1.").doesNotContain("[[image:");
    }

    @Test
    void aTextChapterNeedsNoPages() {
        long id = textChapter(1, "Text");

        service.start(id);

        assertThat(reload(id).getTranslationStatus()).isEqualTo(ChapterTranslationStatus.TRANSLATED);
    }

    @Test
    void theNextTextChapterGetsThePreviousTranslationAsContext() {
        long first = textChapter(1, "One");
        service.start(first);
        long second = textChapter(2, "Two");

        service.start(second);

        assertThat(textTranslator.prompts.get(1).previousText()).isEqualTo("VI: One");
    }

    @Test
    void aFailedTextTranslationSavesNothingAndKeepsTheMessage() {
        long id = textChapter(1, "Text");
        textTranslator.failOnCall = 1;

        service.start(id);

        Chapter c = reload(id);
        assertThat(c.getTranslationStatus()).isEqualTo(ChapterTranslationStatus.FAILED);
        assertThat(c.getTranslationError()).isEqualTo("Gemini free quota is used up, try again later.");
        assertThat(c.getTextVi()).isNull();
    }

    @Test
    void translateAgainOverwritesAnEditedTextAndStartsOver() {
        long id = textChapter(1, "Text");
        service.start(id);
        chapterService.update(id, new ChapterUpdateRequest(null, null, null, "My own edit"));
        assertThat(reload(id).isEditedAfterTranslation()).isTrue();

        service.start(id);

        Chapter c = reload(id);
        assertThat(c.getTextVi()).isEqualTo("VI: Text");
        assertThat(c.isEditedAfterTranslation()).isFalse();
        assertThat(textTranslator.prompts).hasSize(2);
    }

    @Test
    void aTextChapterCanBePublishedOnceTranslated() {
        long id = textChapter(1, "Text");
        service.start(id);

        ChapterDetail published = service.publish(id);

        assertThat(published.publishStatus()).isEqualTo(ChapterPublishStatus.PUBLISHED);
        assertThat(published.text()).isEqualTo("VI: Text");
    }

    @Test
    void aPublishedTextChapterCannotBeTranslatedAgain() {
        long id = textChapter(1, "Text");
        service.start(id);
        service.publish(id);

        assertThatThrownBy(() -> service.start(id)).isInstanceOf(ChapterPublishedException.class);
    }

    @Test
    void textChapterSuccessKeepsTheAiText() {
        long id = textChapter(1, "First.\n\nSecond.");

        service.start(id);

        Chapter c = reload(id);
        assertThat(c.getAiText()).isEqualTo("VI: First.\n\nSecond.").isEqualTo(c.getTextVi());
        chapterService.update(id, new ChapterUpdateRequest(null, null, null, "edited"));
        assertThat(reload(id).getTextVi()).isEqualTo("edited");
        assertThat(reload(id).getAiText()).isEqualTo("VI: First.\n\nSecond.");
    }

    @Test
    void screenshotSuccessKeepsTheJoinedPageTexts() {
        translator.length = 5;
        ChapterDetail c = chapter(1, 2);

        service.start(c.id());

        Chapter done = reload(c.id());
        assertThat(done.getAiText()).isEqualTo("T1 xx\n\nT2 xx");
        assertThat(done.getTextVi()).isNull();
    }

    @Test
    void failedOrPartialTranslationDoesNotSetAiText() {
        ChapterDetail c = chapter(1, 3);
        translator.failOnCall = 1;
        translator.partlyDone = 2;

        service.start(c.id());

        assertThat(reload(c.id()).getTranslationStatus()).isEqualTo(ChapterTranslationStatus.FAILED);
        assertThat(reload(c.id()).getAiText()).isNull();
        long t = textChapter(2, "Text");
        textTranslator.failOnCall = textTranslator.prompts.size() + 1;
        service.start(t);
        assertThat(reload(t).getAiText()).isNull();
    }

    @Test
    void translateAgainReplacesAiText() {
        long id = textChapter(1, "Text");
        service.start(id);
        assertThat(reload(id).getAiText()).isEqualTo("VI: Text");
        tx.executeWithoutResult(s -> reload(id).setSourceText("Other"));

        service.start(id);

        assertThat(reload(id).getAiText()).isEqualTo("VI: Other");
    }
}
