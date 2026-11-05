package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.translate.PromptProfileStore;
import com.subtitlestudio.translate.TranslationFailedException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterEach;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({NotebookService.class, PromptProfileStore.class, NovelProfileStore.class, NotebookServiceTest.Config.class})
// Real commits: updates start after the publishing transaction commits.
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class NotebookServiceTest {

    static final Instant NOW = Instant.parse("2026-11-05T10:00:00Z");

    @TempDir
    static Path dataDir;

    /** Records each call; answers a fixed update unless {@link #answer} says otherwise. */
    static class FakeUpdater implements NotebookUpdater {
        final List<String> calls = new ArrayList<>();
        final List<String> notebooks = new ArrayList<>();
        Consumer<Integer> during;
        RuntimeException failure;
        NotebookUpdate answer;

        @Override
        public NotebookUpdate propose(String profile, String notebookText, int chapterNo, String chapterText) {
            calls.add(chapterNo + ":" + chapterText);
            notebooks.add(notebookText);
            if (during != null) {
                Consumer<Integer> d = during;
                during = null;
                d.accept(chapterNo);
            }
            if (failure != null) {
                throw failure;
            }
            return answer != null ? answer : new NotebookUpdate(
                    List.of(new NotebookContent.GlossaryEntry("ชื่อ" + chapterNo, "Tên " + chapterNo, null)),
                    List.of(), List.of(), "Tóm tắt tới chương " + chapterNo, "Chương " + chapterNo);
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }

        @Bean
        FakeUpdater updater() {
            return new FakeUpdater();
        }

        @Bean
        ObjectMapper objectMapper() {
            return new ObjectMapper();
        }

        @Bean(name = "translationExecutor")
        Executor translationExecutor() {
            return Runnable::run;
        }

        @Bean
        SubtitleStudioProperties properties() {
            return new SubtitleStudioProperties(
                    new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir,
                    new SubtitleStudioProperties.Gemini("key", "m", Duration.ofMinutes(3), Duration.ofMinutes(60),
                            0.3, List.of()),
                    new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
        }
    }

    @BeforeAll
    static void profiles() throws IOException {
        Files.createDirectories(dataDir.resolve("prompts/novels"));
        Files.writeString(dataDir.resolve("prompts/novels/SummerLove.md"), "Ngôn ngữ gốc: tiếng Thái");
    }

    @Autowired
    private NotebookService service;

    @Autowired
    private FakeUpdater updater;

    @Autowired
    private NovelRepository novels;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private ChapterPageRepository pages;

    @Autowired
    private NovelNotebookRepository notebooks;

    @Autowired
    private MediaRepository media;

    @Autowired
    private MutableClock clock;

    @Autowired
    private TransactionTemplate tx;

    private long novelId;

    @BeforeEach
    void setUp() {
        clock.reset();
        updater.calls.clear();
        updater.notebooks.clear();
        updater.during = null;
        updater.failure = null;
        updater.answer = null;
        Novel n = new Novel("n", "Tình Yêu", NovelStatus.ONGOING, NOW);
        n.setPromptProfile("SummerLove");
        novelId = novels.save(n).getId();
    }

    @AfterEach
    void cleanUp() {
        notebooks.deleteAll();
        pages.deleteAll();
        chapters.deleteAll();
        novels.deleteAll();
        media.deleteAll();
    }

    private void publishedChapter(int no, String text) {
        tx.executeWithoutResult(s -> {
            Novel n = novels.findById(novelId).orElseThrow();
            Chapter c = new Chapter(n, no, null, NOW);
            c.setPublishStatus(ChapterPublishStatus.PUBLISHED);
            chapters.save(c);
            ChapterPage p = new ChapterPage(c, 1, media.save(new Media("image/png", 1, "p.png", NOW)));
            p.setTextVi(text);
            pages.save(p);
        });
    }

    private Novel novel() {
        return novels.findById(novelId).orElseThrow();
    }

    @Test
    void publishCreatesVersionAfterChapter() {
        publishedChapter(1, "Chương một");

        service.scheduleUpdate(novelId, 1);

        assertThat(updater.calls).containsExactly("1:Chương một");
        assertThat(updater.notebooks).containsExactly((String) null);
        NotebookView view = service.view(novelId, null);
        assertThat(view.afterChapterNo()).isEqualTo(1);
        assertThat(view.versions()).containsExactly(1);
        assertThat(view.content().storySoFar()).isEqualTo("Tóm tắt tới chương 1");
        assertThat(view.status()).isEqualTo(NotebookStatus.IDLE);
        assertThat(service.textBefore(novelId, 2)).contains("Tên 1");
    }

    @Test
    void updateReadsTheWholeChapterText() {
        publishedChapter(1, "Trang một");
        tx.executeWithoutResult(st -> chapters.findByNovelIdAndChapterNo(novelId, 1).orElseThrow()
                .setTextVi("Bản sửa cả chương"));

        service.scheduleUpdate(novelId, 1);

        assertThat(updater.calls).containsExactly("1:Bản sửa cả chương");
    }

    @Test
    void updateUsesNotebookBeforeChapter() {
        publishedChapter(3, "Ba");
        publishedChapter(5, "Năm");
        publishedChapter(8, "Tám");
        service.scheduleUpdate(novelId, 3);
        service.scheduleUpdate(novelId, 8);
        updater.notebooks.clear();
        clock.advance(Duration.ofMinutes(5));

        service.scheduleUpdate(novelId, 5);

        assertThat(updater.notebooks.getFirst()).contains("Tên 3").doesNotContain("Tên 8");
        NotebookView five = service.view(novelId, 5);
        assertThat(five.versions()).containsExactly(3, 5, 8);
        assertThat(five.content().glossary()).extracting(NotebookContent.GlossaryEntry::target)
                .containsExactly("Tên 3", "Tên 5");
        assertThat(five.staleLaterVersions()).isTrue();
        assertThat(service.view(novelId, 3).staleLaterVersions()).isFalse();
    }

    @Test
    void invalidUpdateKeepsOldAndRecordsError() {
        publishedChapter(1, "Một");
        service.scheduleUpdate(novelId, 1);
        publishedChapter(2, "Hai");
        updater.answer = new NotebookUpdate(List.of(), List.of(), List.of(), "x".repeat(2_501), "c");

        service.scheduleUpdate(novelId, 2);

        Novel n = novel();
        assertThat(n.getNotebookStatus()).isEqualTo(NotebookStatus.FAILED);
        assertThat(n.getNotebookError()).contains("storySoFar");
        assertThat(service.view(novelId, null).versions()).containsExactly(1);
        assertThat(chapters.findByNovelIdAndChapterNo(novelId, 2).orElseThrow().getPublishStatus())
                .isEqualTo(ChapterPublishStatus.PUBLISHED);
    }

    @Test
    void geminiErrorIsRecorded() {
        publishedChapter(1, "Một");
        updater.failure = new TranslationFailedException("Gemini free quota is used up, try again later.");

        service.scheduleUpdate(novelId, 1);

        assertThat(novel().getNotebookError()).isEqualTo("Gemini free quota is used up, try again later.");
    }

    @Test
    void retryRunsLastFailedChapter() {
        publishedChapter(4, "Bốn");
        updater.failure = new TranslationFailedException("busy");
        service.scheduleUpdate(novelId, 4);
        updater.failure = null;
        updater.calls.clear();

        service.retry(novelId);

        assertThat(updater.calls).containsExactly("4:Bốn");
        assertThat(novel().getNotebookStatus()).isEqualTo(NotebookStatus.IDLE);
        assertThat(novel().getNotebookError()).isNull();
    }

    @Test
    void retryWhileUpdatingIs409() {
        tx.executeWithoutResult(s -> novels.findById(novelId).orElseThrow()
                .setNotebookStatus(NotebookStatus.UPDATING));

        assertThatThrownBy(() -> service.retry(novelId)).isInstanceOf(NotebookUpdateInProgressException.class);
    }

    @Test
    void queuedWhileRunning() {
        publishedChapter(5, "Năm");
        publishedChapter(6, "Sáu");
        updater.during = no -> service.scheduleUpdate(novelId, 6);

        service.scheduleUpdate(novelId, 5);

        assertThat(updater.calls).containsExactly("5:Năm", "6:Sáu");
        assertThat(service.view(novelId, null).versions()).containsExactly(5, 6);
        assertThat(updater.notebooks.get(1)).contains("Tên 5");
    }

    @Test
    void novelDeletedMidUpdateEndsQuietly() {
        publishedChapter(1, "Một");
        updater.during = no -> {
            notebooks.deleteAll();
            pages.deleteAll();
            chapters.deleteAll();
            novels.deleteAll();
        };

        service.scheduleUpdate(novelId, 1);

        assertThat(notebooks.count()).isZero();
        assertThat(novels.count()).isZero();
    }

    @Test
    void unexpectedErrorFailsInsteadOfStayingUpdating() {
        publishedChapter(1, "Một");
        updater.failure = new IllegalStateException("boom");

        service.scheduleUpdate(novelId, 1);

        assertThat(novel().getNotebookStatus()).isEqualTo(NotebookStatus.FAILED);
        assertThat(novel().getNotebookError()).isEqualTo("Could not update the notebook: IllegalStateException.");
        updater.failure = null;
        service.retry(novelId);
        assertThat(novel().getNotebookStatus()).isEqualTo(NotebookStatus.IDLE);
    }

    @Autowired
    private NovelProfileStore profileStore;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void withoutGeminiKeyNothingIsSent() {
        publishedChapter(1, "Một");
        SubtitleStudioProperties noKey = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir,
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                        List.of()),
                new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
        NotebookService off = new NotebookService(noKey, novels, chapters, pages, notebooks, updater, profileStore,
                objectMapper, tx, Runnable::run, clock);

        off.scheduleUpdate(novelId, 1);

        assertThat(updater.calls).isEmpty();
        assertThat(novel().getNotebookStatus()).isEqualTo(NotebookStatus.IDLE);
    }

    @Test
    void textBeforeReturnsNullWhenNone() {
        assertThat(service.textBefore(novelId, 1)).isNull();
    }

    @Test
    void restartMarksUpdatingFailed() {
        tx.executeWithoutResult(s -> novels.findById(novelId).orElseThrow()
                .setNotebookStatus(NotebookStatus.UPDATING));

        service.markInterrupted();

        assertThat(novel().getNotebookStatus()).isEqualTo(NotebookStatus.FAILED);
        assertThat(novel().getNotebookError()).isEqualTo("Notebook update was interrupted.");
    }

    @Test
    void scheduledInsideATransactionWaitsForCommit() {
        publishedChapter(1, "Một");

        tx.executeWithoutResult(s -> {
            service.scheduleUpdate(novelId, 1);
            assertThat(updater.calls).isEmpty();
        });

        assertThat(updater.calls).containsExactly("1:Một");
    }
}
