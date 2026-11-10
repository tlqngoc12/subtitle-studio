package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.subtitle.SrtWriter;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.url.UrlParser;
import com.subtitlestudio.video.CueEntity;
import com.subtitlestudio.video.CueRepository;
import com.subtitlestudio.video.SubtitleFileStore;
import com.subtitlestudio.video.SubtitleService;
import com.subtitlestudio.video.TranslationStatus;
import com.subtitlestudio.video.ViCue;
import com.subtitlestudio.video.ViSource;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoNotFoundException;
import com.subtitlestudio.video.VideoRepository;
import com.subtitlestudio.video.VietsubService;
import com.subtitlestudio.ytdlp.VideoInfo;
import com.subtitlestudio.ytdlp.YtDlpClient;
import com.subtitlestudio.ytdlp.YtDlpFailedException;
import java.util.Set;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({TranslationService.class, VietsubService.class, SrtParser.class, SrtWriter.class, UrlParser.class,
        SubtitleFileStore.class, PromptProfileStore.class, PartialTranslationStore.class,
        TranslationServiceTest.Config.class})
@ExtendWith(OutputCaptureExtension.class)
class TranslationServiceTest {

    private static final String ID = "dQw4w9WgXcQ";
    private static final String PROFILE = "EmiBonnie";
    private static final Instant NOW = Instant.parse("2026-11-03T10:00:00Z");
    private static final Path DATA_DIR = createDataDir();

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    private static Path createDataDir() {
        try {
            Path dir = Files.createTempDirectory("translation-service-test");
            Files.createDirectories(dir.resolve("prompts"));
            Files.writeString(dir.resolve("prompts/EmiBonnie.md"), "## Xưng hô\nchị - em", StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("prompts/Other.md"), "## Khác", StandardCharsets.UTF_8);
            return dir;
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** Runs submitted work immediately, or holds it until {@link #runPending()} when {@code hold} is set. */
    static class TestExecutor implements Executor {
        boolean hold;
        final List<Runnable> pending = new ArrayList<>();

        @Override
        public void execute(Runnable command) {
            if (hold) {
                pending.add(command);
            } else {
                command.run();
            }
        }

        void runPending() {
            List<Runnable> work = new ArrayList<>(pending);
            pending.clear();
            work.forEach(Runnable::run);
        }
    }

    /** Translates "Hello" to "Dịch: Hello"; behaviour can be replaced per test. */
    static class FakeTranslator implements GeminiTranslator {
        final AtomicInteger calls = new AtomicInteger();
        String lastProfile;
        VideoContext lastContext;
        GeminiTranslator behaviour;
        /** Reported through onTrying before the work; null = none. */
        String model;
        /** When set, gives the model reported before each call (wins over {@code model}). */
        java.util.function.Supplier<String> modelPerCall;

        @Override
        public List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines,
                                              java.util.function.Consumer<String> onTrying) {
            if (modelPerCall != null) {
                onTrying.accept(modelPerCall.get());
            } else if (model != null) {
                onTrying.accept(model);
            }
            return translate(video, profile, lines);
        }

        @Override
        public List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines) {
            calls.incrementAndGet();
            lastProfile = profile;
            lastContext = video;
            if (behaviour != null) {
                return behaviour.translate(video, profile, lines);
            }
            return lines.stream().map(l -> new TranslatedLine(l.id(), "Dịch: " + l.text())).toList();
        }
    }

    @TestConfiguration
    @EnableConfigurationProperties(SubtitleStudioProperties.class)
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }

        @Bean
        com.fasterxml.jackson.databind.ObjectMapper objectMapper() {
            return new com.fasterxml.jackson.databind.ObjectMapper();
        }

        @Bean
        FakeTranslator fakeTranslator() {
            return new FakeTranslator();
        }

        @Bean(name = "translationExecutor")
        TestExecutor translationExecutor() {
            return new TestExecutor();
        }
    }

    @MockitoBean
    private SubtitleService subtitleService;

    @MockitoBean
    private ExampleSource exampleSource;

    @MockitoBean
    private YtDlpClient ytDlp;

    @Autowired
    private TranslationService service;

    @Autowired
    private VietsubService vietsub;

    @Autowired
    private VideoRepository videos;

    @Autowired
    private CueRepository cues;

    @Autowired
    private FakeTranslator translator;

    @Autowired
    private TestExecutor executor;

    @Autowired
    private SubtitleStudioProperties properties;

    @Autowired
    private PromptProfileStore profiles;

    @Autowired
    private TransactionTemplate tx;

    @Autowired
    private PartialTranslationStore store;

    @BeforeEach
    void reset() {
        translator.calls.set(0);
        translator.behaviour = null;
        translator.model = null;
        translator.modelPerCall = null;
        translator.lastContext = null;
        org.mockito.Mockito.reset(exampleSource, ytDlp);
        executor.hold = false;
        executor.pending.clear();
        try {
            Files.deleteIfExists(DATA_DIR.resolve("translate-partial/" + ID + ".json"));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private Video video(Integer durationSec) {
        Video v = new Video(ID);
        v.update("VLOG OF US", "EMIBONNIE", durationSec, "en", SourceType.MANUAL, 3, NOW);
        Video saved = videos.save(v);
        cues.save(new CueEntity(saved, 0, 1_000, 2_000, "Hello"));
        cues.save(new CueEntity(saved, 1, 2_000, 3_000, "- Hungry?\n- A little."));
        cues.save(new CueEntity(saved, 2, 3_000, 4_000, "Bye"));
        videos.flush();
        return saved;
    }

    private Video reload() {
        return videos.findById(ID).orElseThrow();
    }

    private byte[] manualSrt() {
        return "1\n00:00:05,000 --> 00:00:06,000\nBản tay\n\n".getBytes(StandardCharsets.UTF_8);
    }

    // --- success ---

    @Test
    void startsAndSavesAutoVietsub() throws IOException {
        video(600);

        assertThat(service.startFromFetch(ID, PROFILE)).isNull();

        Video v = reload();
        assertThat(v.getViSource()).isEqualTo(ViSource.AUTO);
        assertThat(v.getTranslationStatus()).isNull();
        assertThat(v.getTranslationProfile()).isEqualTo(PROFILE);
        assertThat(v.getViCueCount()).isEqualTo(3);
        assertThat(vietsub.getCues(ID)).containsExactly(
                new ViCue(1_000, 2_000, "Dịch: Hello"),
                new ViCue(2_000, 3_000, "Dịch: - Hungry?\n- A little."),
                new ViCue(3_000, 4_000, "Dịch: Bye"));
        assertThat(translator.lastProfile).isEqualTo("## Xưng hô\nchị - em");
        String file = Files.readString(DATA_DIR.resolve("subs/" + ID + ".vi_auto.srt"));
        assertThat(file).contains("Dịch: Hello").contains("00:00:03,000 --> 00:00:04,000");
    }

    // --- conditions: from Get Engsub ---

    @Test
    void notConfiguredSkipsFromFetch() {
        video(600);
        TranslationService off = serviceWithKey("");

        assertThat(off.startFromFetch(ID, PROFILE)).isEqualTo(SkipReason.GEMINI_NOT_CONFIGURED);
        assertThat(translator.calls).hasValue(0);
    }

    @Test
    void tooLongSkipsFromFetch() {
        video(3 * 3600 + 60); // 3h01

        assertThat(service.startFromFetch(ID, PROFILE)).isEqualTo(SkipReason.VIDEO_TOO_LONG);
        assertThat(translator.calls).hasValue(0);
    }

    @Test
    void unknownDurationIsAllowed() {
        video(null);

        assertThat(service.startFromFetch(ID, PROFILE)).isNull();
        assertThat(reload().getViSource()).isEqualTo(ViSource.AUTO);
    }

    @Test
    void manualSkipsFromFetch() {
        video(600);
        vietsub.add(ID, manualSrt());

        assertThat(service.startFromFetch(ID, PROFILE)).isEqualTo(SkipReason.VIETSUB_MANUAL);
        assertThat(translator.calls).hasValue(0);
    }

    @Test
    void autoExistsSkipsFromFetch() {
        video(600);
        service.startFromFetch(ID, PROFILE);

        assertThat(service.startFromFetch(ID, PROFILE)).isEqualTo(SkipReason.VIETSUB_EXISTS);
        assertThat(translator.calls).hasValue(1);
    }

    @Test
    void doubleStartCreatesOneRun() {
        video(600);
        executor.hold = true;

        assertThat(service.startFromFetch(ID, PROFILE)).isNull();
        assertThat(service.startFromFetch(ID, PROFILE)).isEqualTo(SkipReason.TRANSLATION_IN_PROGRESS);
        assertThat(reload().getTranslationStatus()).isEqualTo(TranslationStatus.TRANSLATING);

        executor.runPending();

        assertThat(translator.calls).hasValue(1);
        assertThat(reload().getViSource()).isEqualTo(ViSource.AUTO);
    }

    @Test
    void conditionalUpdateRejectsSecondStart() {
        video(600);

        Integer first = tx.execute(s -> videos.markTranslating(ID, PROFILE));
        Integer second = tx.execute(s -> videos.markTranslating(ID, PROFILE));

        assertThat(first).isEqualTo(1);
        assertThat(second).isZero();
    }

    // --- conditions: Dịch lại ---

    @Test
    void autoExistsRetranslates() {
        video(600);
        service.startFromFetch(ID, PROFILE);
        translator.behaviour = (v, p, lines) -> lines.stream().map(l -> new TranslatedLine(l.id(), "Lần hai")).toList();

        service.retranslate(ID, PROFILE);

        assertThat(translator.calls).hasValue(2);
        assertThat(vietsub.getCues(ID)).allMatch(c -> c.text().equals("Lần hai"));
    }

    @Test
    void retranslateGuards() {
        assertThatThrownBy(() -> service.retranslate(ID, PROFILE)).isInstanceOf(VideoNotFoundException.class);
        video(600);
        assertThatThrownBy(() -> serviceWithKey(" ").retranslate(ID, PROFILE)).isInstanceOf(GeminiNotConfiguredException.class);
        assertThatThrownBy(() -> service.retranslate(ID, "Nope")).isInstanceOf(UnknownProfileException.class);
        vietsub.add(ID, manualSrt());
        assertThatThrownBy(() -> service.retranslate(ID, PROFILE)).isInstanceOf(VietsubManualException.class);
        assertThat(translator.calls).hasValue(0);
    }

    @Test
    void retranslateTooLongAndInProgress() {
        video(3 * 3600 + 60);
        assertThatThrownBy(() -> service.retranslate(ID, PROFILE)).isInstanceOf(VideoTooLongException.class);

        Video v = reload();
        v.update(v.getTitle(), v.getChannel(), 600, v.getSubLang(), v.getSubSource(), v.getCueCount(), NOW);
        videos.flush();
        executor.hold = true;
        service.retranslate(ID, PROFILE);
        assertThatThrownBy(() -> service.retranslate(ID, PROFILE)).isInstanceOf(TranslationInProgressException.class);
    }

    // --- races and failures ---

    @Test
    void manualUploadDuringTranslationWins() {
        video(600);
        translator.behaviour = (v, p, lines) -> {
            vietsub.add(ID, manualSrt());
            return lines.stream().map(l -> new TranslatedLine(l.id(), "Gemini")).toList();
        };

        service.startFromFetch(ID, PROFILE);

        Video v = reload();
        assertThat(v.getViSource()).isEqualTo(ViSource.MANUAL);
        assertThat(v.getTranslationStatus()).isNull();
        assertThat(vietsub.getCues(ID)).containsExactly(new ViCue(5_000, 6_000, "Bản tay"));
    }

    @Test
    void videoDeletedDuringTranslationIsIgnored() {
        video(600);
        translator.behaviour = (v, p, lines) -> {
            cues.deleteByVideoId(ID);
            videos.deleteById(ID);
            videos.flush();
            return lines.stream().map(l -> new TranslatedLine(l.id(), "x")).toList();
        };

        service.startFromFetch(ID, PROFILE);

        assertThat(videos.findById(ID)).isEmpty();
    }

    @Test
    void showsTheModelWhileTranslatingAndStoresItAfterwards() {
        video(600);
        translator.model = "gemini-x";
        String[] during = {"unset"};
        translator.behaviour = (v, p, lines) -> {
            during[0] = service.activeModel(ID);
            return lines.stream().map(l -> new TranslatedLine(l.id(), "Dịch: " + l.text())).toList();
        };

        service.startFromFetch(ID, PROFILE);

        assertThat(during[0]).isEqualTo("gemini-x");
        assertThat(reload().getTranslationModel()).isEqualTo("gemini-x");
        assertThat(service.activeModel(ID)).isNull();
    }

    @Test
    void failureKeepsTheStoredVietsubModelAndClearsTheActiveOne() {
        Video saved = video(600);
        saved.setTranslationModel("old");
        videos.flush();
        translator.model = "new";
        translator.behaviour = (v, p, lines) -> {
            throw new TranslationFailedException("Gemini free quota is used up, try again later.");
        };

        service.startFromFetch(ID, PROFILE);

        assertThat(reload().getTranslationStatus()).isEqualTo(TranslationStatus.FAILED);
        assertThat(reload().getTranslationModel()).isEqualTo("old");
        assertThat(service.activeModel(ID)).isNull();
    }

    @Test
    void failureMarksFailedWithMessage() {
        video(600);
        translator.behaviour = (v, p, lines) -> {
            throw new TranslationFailedException("Gemini free quota is used up, try again later.");
        };

        service.startFromFetch(ID, PROFILE);

        Video v = reload();
        assertThat(v.getTranslationStatus()).isEqualTo(TranslationStatus.FAILED);
        assertThat(v.getTranslationError()).isEqualTo("Gemini free quota is used up, try again later.");
        assertThat(v.getViSource()).isNull();
    }

    @Test
    void failureIsLoggedWithTheVideoId(CapturedOutput output) {
        video(600);
        translator.behaviour = (v, p, lines) -> {
            throw new TranslationFailedException("Gemini returned missing or mismatched lines (1/2 valid), try again.");
        };

        service.startFromFetch(ID, PROFILE);

        assertThat(output).contains("Translation of " + ID + " failed: Gemini returned missing or mismatched lines");
    }

    @Test
    void unexpectedErrorMarksFailedGeneric() {
        video(600);
        translator.behaviour = (v, p, lines) -> {
            throw new IllegalStateException("x".repeat(2000));
        };

        service.startFromFetch(ID, PROFILE);

        Video v = reload();
        assertThat(v.getTranslationStatus()).isEqualTo(TranslationStatus.FAILED);
        assertThat(v.getTranslationError()).startsWith("Could not translate: ").hasSizeLessThanOrEqualTo(500);
    }

    @Test
    void retryAfterFailureClearsError() {
        video(600);
        translator.behaviour = (v, p, lines) -> {
            throw new TranslationFailedException("lỗi");
        };
        service.startFromFetch(ID, PROFILE);
        translator.behaviour = null;
        executor.hold = true;

        service.retranslate(ID, PROFILE);

        Video v = reload();
        assertThat(v.getTranslationStatus()).isEqualTo(TranslationStatus.TRANSLATING);
        assertThat(v.getTranslationError()).isNull();
    }

    @Test
    void markInterruptedFailsRunning() {
        video(600);
        executor.hold = true;
        service.startFromFetch(ID, PROFILE);

        service.markInterrupted();

        Video v = reload();
        assertThat(v.getTranslationStatus()).isEqualTo(TranslationStatus.FAILED);
        assertThat(v.getTranslationError()).isEqualTo("Interrupted by an app restart, translate again.");
    }

    // --- series context: examples and description ---

    @Test
    void passesTheExamplesOfTheSameProfileToTheTranslator() {
        video(600);
        var pairs = List.of(new ExamplePair("Hi Mon", "Chào em Mon"));
        org.mockito.Mockito.when(exampleSource.examplesFor(PROFILE, ID)).thenReturn(pairs);

        service.startFromFetch(ID, PROFILE);

        assertThat(translator.lastContext.examples()).isEqualTo(pairs);
        assertThat(translator.lastContext.title()).isEqualTo("VLOG OF US");
    }

    @Test
    void failingToBuildExamplesNeverFailsTheTranslation(CapturedOutput output) {
        video(600);
        org.mockito.Mockito.when(exampleSource.examplesFor(PROFILE, ID)).thenThrow(new IllegalStateException("secret subtitle text"));

        service.startFromFetch(ID, PROFILE);

        assertThat(reload().getViSource()).isEqualTo(ViSource.AUTO);
        assertThat(translator.lastContext.examples()).isEmpty();
        assertThat(output).contains("Could not build examples for " + ID).doesNotContain("secret subtitle text");
    }

    @Test
    void sendsTheCleanedStoredDescriptionWithoutAskingYtDlp() {
        Video v = video(600);
        v.setDescription("Cast: Emi\nhttps://example.com\nSubscribe now");
        videos.flush();

        service.startFromFetch(ID, PROFILE);

        assertThat(translator.lastContext.description()).isEqualTo("Cast: Emi");
        org.mockito.Mockito.verifyNoInteractions(ytDlp);
    }

    @Test
    void translateAgainFillsAMissingDescriptionFromYtDlpAndStoresIt() {
        video(600);
        service.startFromFetch(ID, PROFILE); // from Get Engsub: no yt-dlp call
        org.mockito.Mockito.verifyNoInteractions(ytDlp);
        org.mockito.Mockito.when(ytDlp.fetchInfo(ID)).thenReturn(
                new VideoInfo(ID, "t", "c", 60, Set.of(), Set.of("en"), "Cast: Emi as Mon"));

        service.retranslate(ID, PROFILE);

        assertThat(translator.lastContext.description()).isEqualTo("Cast: Emi as Mon");
        assertThat(reload().getDescription()).isEqualTo("Cast: Emi as Mon");
        service.retranslate(ID, PROFILE); // stored now: no second yt-dlp call
        org.mockito.Mockito.verify(ytDlp, org.mockito.Mockito.times(1)).fetchInfo(ID);
    }

    @Test
    void translateAgainStillTranslatesWhenYtDlpFails(CapturedOutput output) {
        video(600);
        org.mockito.Mockito.when(ytDlp.fetchInfo(ID)).thenThrow(new YtDlpFailedException("boom"));

        service.retranslate(ID, PROFILE);

        assertThat(reload().getViSource()).isEqualTo(ViSource.AUTO);
        assertThat(reload().getTranslationStatus()).isNull();
        assertThat(translator.lastContext.description()).isNull();
        assertThat(reload().getDescription()).isNull();
        assertThat(output).contains("Could not fetch the description of " + ID);
    }

    @Test
    void translateAgainWithNoDescriptionOnYoutubeTranslatesWithoutOne() {
        video(600);
        org.mockito.Mockito.when(ytDlp.fetchInfo(ID)).thenReturn(new VideoInfo(ID, "t", "c", 60, Set.of(), Set.of("en")));

        service.retranslate(ID, PROFILE);

        assertThat(translator.lastContext.description()).isNull();
        assertThat(reload().getViSource()).isEqualTo(ViSource.AUTO);
    }

    private TranslationService serviceWithKey(String key) {
        var g = properties.gemini();
        var gemini = new SubtitleStudioProperties.Gemini(key, g.model(), g.timeout(), g.maxDuration(), g.partDuration(), g.temperature(), g.fallbackModels());
        var props = new SubtitleStudioProperties(properties.ytdlp(), properties.dataDir(), gemini, properties.publish());
        return new TranslationService(props, profiles, translator, videos, cues, vietsub, tx, executor, exampleSource, ytDlp, store);
    }

    // --- long videos, translated in parts ---

    private static final Path PARTIAL = DATA_DIR.resolve("translate-partial/" + ID + ".json");

    /** One cue per minute, line N saying "SECRET-N"; the video lasts {@code minutes} minutes. */
    private Video longVideo(int minutes) {
        Video v = new Video(ID);
        v.update("LONG", "CHANNEL", minutes * 60, "en", SourceType.MANUAL, minutes, NOW);
        Video saved = videos.save(v);
        for (int i = 0; i < minutes; i++) {
            cues.save(new CueEntity(saved, i, i * 60_000L, i * 60_000L + 2_000, "SECRET-" + i));
        }
        videos.flush();
        return saved;
    }

    /** What each translator call was asked: first and last line id, and the context's previous lines. */
    record Call(int first, int last, List<ExamplePair> previous) {}

    private List<Call> recordCalls() {
        List<Call> calls = new ArrayList<>();
        translator.behaviour = (v, p, lines) -> {
            calls.add(new Call(lines.get(0).id(), lines.get(lines.size() - 1).id(), v.previousLines()));
            return lines.stream().map(l -> new TranslatedLine(l.id(), "VI-" + l.id())).toList();
        };
        return calls;
    }

    @Test
    void aHundredMinuteVideoIsTranslatedInThreePartsWithContext() {
        longVideo(100);
        List<Call> calls = recordCalls();

        service.startFromFetch(ID, PROFILE);

        assertThat(calls).hasSize(3);
        assertThat(calls.get(0)).isEqualTo(new Call(0, 44, List.of()));
        assertThat(calls.get(1).first()).isEqualTo(45);
        assertThat(calls.get(1).last()).isEqualTo(89);
        assertThat(calls.get(1).previous()).hasSize(8);
        assertThat(calls.get(1).previous().get(0)).isEqualTo(new ExamplePair("SECRET-37", "VI-37"));
        assertThat(calls.get(1).previous().get(7)).isEqualTo(new ExamplePair("SECRET-44", "VI-44"));
        assertThat(calls.get(2).first()).isEqualTo(90);
        assertThat(calls.get(2).previous().get(7)).isEqualTo(new ExamplePair("SECRET-89", "VI-89"));
        assertThat(vietsub.getCues(ID)).hasSize(100);
        assertThat(vietsub.getCues(ID).get(99)).isEqualTo(new ViCue(99 * 60_000L, 99 * 60_000L + 2_000, "VI-99"));
        assertThat(reload().getTranslationStatus()).isNull();
        assertThat(PARTIAL).doesNotExist();
    }

    @Test
    void theStatusShowsThePartAndClearsItAtTheEnd() {
        longVideo(100);
        translator.model = "gemini-x";
        List<String> seen = new ArrayList<>();
        translator.behaviour = (v, p, lines) -> {
            seen.add(service.activePart(ID) + "/" + service.activeModel(ID));
            return lines.stream().map(l -> new TranslatedLine(l.id(), "x")).toList();
        };

        service.startFromFetch(ID, PROFILE);

        assertThat(seen).containsExactly("1/3/gemini-x", "2/3/gemini-x", "3/3/gemini-x");
        assertThat(service.activePart(ID)).isNull();
        assertThat(service.activeModel(ID)).isNull();
    }

    @Test
    void theStoredModelListsEachDistinctModelInOrder() {
        longVideo(100);
        String[] models = {"m1", "m1", "m2"};
        int[] part = {0};
        translator.behaviour = (v, p, lines) -> lines.stream().map(l -> new TranslatedLine(l.id(), "x")).toList();
        translator.modelPerCall = () -> models[part[0]++];

        service.startFromFetch(ID, PROFILE);

        assertThat(reload().getTranslationModel()).isEqualTo("m1, m2");
    }

    @Test
    void aFailedPartKeepsTheFinishedOnesAndTranslateAgainContinuesFromIt() {
        longVideo(100);
        int[] call = {0};
        List<Call> calls = new ArrayList<>();
        translator.behaviour = (v, p, lines) -> {
            call[0]++;
            calls.add(new Call(lines.get(0).id(), lines.get(lines.size() - 1).id(), v.previousLines()));
            if (call[0] == 2) {
                throw new TranslationFailedException("Gemini free quota is used up, try again later.");
            }
            return lines.stream().map(l -> new TranslatedLine(l.id(), "VI-" + l.id())).toList();
        };

        service.startFromFetch(ID, PROFILE);

        Video failed = reload();
        assertThat(failed.getTranslationStatus()).isEqualTo(TranslationStatus.FAILED);
        assertThat(failed.getTranslationError()).contains("part 2/3").contains("quota is used up")
                .contains("Translate again continues from part 2");
        assertThat(service.activePart(ID)).isNull();
        assertThat(service.activeModel(ID)).isNull();
        assertThat(PARTIAL).exists();
        assertThat(failed.getViSource()).isNull();

        calls.clear();
        service.retranslate(ID, PROFILE);

        assertThat(calls).extracting(Call::first).containsExactly(45, 90); // part 1 is not asked again
        assertThat(calls.get(0).previous().get(7)).isEqualTo(new ExamplePair("SECRET-44", "VI-44")); // from the file
        assertThat(reload().getTranslationStatus()).isNull();
        assertThat(vietsub.getCues(ID)).extracting(ViCue::text)
                .containsExactlyElementsOf(java.util.stream.IntStream.range(0, 100).mapToObj(i -> "VI-" + i).toList());
        assertThat(PARTIAL).doesNotExist();
    }

    @Test
    void aPartialFileOfAnotherProfileIsDiscarded() {
        longVideo(100);
        int[] call = {0};
        translator.behaviour = (v, p, lines) -> {
            if (++call[0] == 2) {
                throw new TranslationFailedException("busy");
            }
            return lines.stream().map(l -> new TranslatedLine(l.id(), "OLD")).toList();
        };
        service.startFromFetch(ID, PROFILE);
        assertThat(PARTIAL).exists();

        List<Call> calls = recordCalls();
        service.retranslate(ID, "Other");

        assertThat(calls).extracting(Call::first).containsExactly(0, 45, 90);
        assertThat(vietsub.getCues(ID)).extracting(ViCue::text).doesNotContain("OLD");
    }

    @Test
    void aPartialFileWithAnotherCueCountIsDiscarded() throws IOException {
        longVideo(100);
        Files.createDirectories(PARTIAL.getParent());
        Files.writeString(PARTIAL, "{\"profile\":\"" + PROFILE + "\",\"cueCount\":99,\"parts\":[{\"index\":0,"
                + "\"lines\":[{\"idx\":0,\"text\":\"OLD\"}],\"model\":\"m\"}]}");
        List<Call> calls = recordCalls();

        service.startFromFetch(ID, PROFILE);

        assertThat(calls).extracting(Call::first).containsExactly(0, 45, 90);
        assertThat(vietsub.getCues(ID)).extracting(ViCue::text).doesNotContain("OLD");
        assertThat(PARTIAL).doesNotExist();
    }

    @Test
    void aCompletePartialFileIsSavedWithoutAskingGeminiAgain() throws IOException {
        longVideo(100);
        // Every part finished earlier, but the run died before the Vietsub was saved.
        int[][] ranges = {{0, 45}, {45, 90}, {90, 100}};
        StringBuilder json = new StringBuilder("{\"profile\":\"" + PROFILE + "\",\"cueCount\":100,\"parts\":[");
        for (int p = 0; p < ranges.length; p++) {
            json.append(p > 0 ? "," : "").append("{\"index\":").append(p).append(",\"model\":\"m\",\"lines\":[");
            for (int i = ranges[p][0]; i < ranges[p][1]; i++) {
                json.append(i > ranges[p][0] ? "," : "").append("{\"idx\":").append(i).append(",\"text\":\"VI-").append(i).append("\"}");
            }
            json.append("]}");
        }
        json.append("]}");
        Files.createDirectories(PARTIAL.getParent());
        Files.writeString(PARTIAL, json.toString());
        List<Call> calls = recordCalls();

        service.startFromFetch(ID, PROFILE);

        assertThat(calls).isEmpty();
        assertThat(vietsub.getCues(ID)).extracting(ViCue::text)
                .containsExactlyElementsOf(java.util.stream.IntStream.range(0, 100).mapToObj(i -> "VI-" + i).toList());
        assertThat(reload().getTranslationStatus()).isNull();
        assertThat(PARTIAL).doesNotExist();
    }

    @Test
    void aVideoOfThreeHoursIsAcceptedAndOneMinuteMoreIsNot() {
        longVideo(3);
        Video v = reload();
        v.update(v.getTitle(), v.getChannel(), 3 * 3600 - 60, v.getSubLang(), v.getSubSource(), 3, NOW);
        videos.flush();

        assertThat(service.startFromFetch(ID, PROFILE)).isNull();
        assertThat(reload().getViSource()).isEqualTo(ViSource.AUTO);

        v = reload();
        v.update(v.getTitle(), v.getChannel(), 3 * 3600 + 60, v.getSubLang(), v.getSubSource(), 3, NOW);
        videos.flush();
        assertThatThrownBy(() -> service.retranslate(ID, PROFILE)).isInstanceOf(VideoTooLongException.class);
    }

    @Test
    void aFortyMinuteVideoIsOneCallAndLeavesNoPartialFile() {
        longVideo(40);
        List<Call> calls = recordCalls();

        service.startFromFetch(ID, PROFILE);

        assertThat(calls).containsExactly(new Call(0, 39, List.of()));
        assertThat(translator.calls).hasValue(1);
        assertThat(service.activePart(ID)).isNull();
        assertThat(PARTIAL).doesNotExist();
    }

    @Test
    void aFailedOnePartVideoKeepsTheOldMessage() {
        longVideo(40);
        translator.behaviour = (v, p, lines) -> {
            throw new TranslationFailedException("Gemini free quota is used up, try again later.");
        };

        service.startFromFetch(ID, PROFILE);

        assertThat(reload().getTranslationError()).isEqualTo("Gemini free quota is used up, try again later.");
    }

    @Test
    void removingTheVideoRemovesThePartialFile() throws IOException {
        longVideo(100);
        Files.createDirectories(PARTIAL.getParent());
        Files.writeString(PARTIAL, "{}");

        store.on(new com.subtitlestudio.video.VideoRemovalEvent(ID));

        assertThat(PARTIAL).doesNotExist();
    }

    @Test
    void partsNeverLogSubtitleText(CapturedOutput output) {
        longVideo(100);
        int[] call = {0};
        translator.behaviour = (v, p, lines) -> {
            if (++call[0] == 2) {
                throw new TranslationFailedException("busy");
            }
            return lines.stream().map(l -> new TranslatedLine(l.id(), "VI-" + l.id())).toList();
        };

        service.startFromFetch(ID, PROFILE);
        service.retranslate(ID, PROFILE);

        assertThat(output).contains("translate " + ID + ": part 1/3, 45 lines").contains("part 3/3, 10 lines");
        assertThat(output.getAll()).doesNotContain("SECRET-").doesNotContain("VI-");
    }
}
