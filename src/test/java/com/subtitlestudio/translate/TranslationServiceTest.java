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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
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
        SubtitleFileStore.class, PromptProfileStore.class, TranslationServiceTest.Config.class})
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
        GeminiTranslator behaviour;

        @Override
        public List<TranslatedLine> translate(VideoContext video, String profile, List<SourceLine> lines) {
            calls.incrementAndGet();
            lastProfile = profile;
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

    @BeforeEach
    void reset() {
        translator.calls.set(0);
        translator.behaviour = null;
        executor.hold = false;
        executor.pending.clear();
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

    // --- conditions: from Lấy Engsub ---

    @Test
    void notConfiguredSkipsFromFetch() {
        video(600);
        TranslationService off = serviceWithKey("");

        assertThat(off.startFromFetch(ID, PROFILE)).isEqualTo(SkipReason.GEMINI_NOT_CONFIGURED);
        assertThat(translator.calls).hasValue(0);
    }

    @Test
    void tooLongSkipsFromFetch() {
        video(3601);

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
        video(4000);
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
    void failureMarksFailedWithMessage() {
        video(600);
        translator.behaviour = (v, p, lines) -> {
            throw new TranslationFailedException("Hết lượt miễn phí của Gemini, thử lại sau.");
        };

        service.startFromFetch(ID, PROFILE);

        Video v = reload();
        assertThat(v.getTranslationStatus()).isEqualTo(TranslationStatus.FAILED);
        assertThat(v.getTranslationError()).isEqualTo("Hết lượt miễn phí của Gemini, thử lại sau.");
        assertThat(v.getViSource()).isNull();
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
        assertThat(v.getTranslationError()).startsWith("Không dịch được: ").hasSizeLessThanOrEqualTo(500);
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
        assertThat(v.getTranslationError()).isEqualTo("Bị gián đoạn do app khởi động lại, hãy dịch lại.");
    }

    private TranslationService serviceWithKey(String key) {
        var g = properties.gemini();
        var gemini = new SubtitleStudioProperties.Gemini(key, g.model(), g.timeout(), Duration.ofMinutes(60), g.temperature());
        var props = new SubtitleStudioProperties(properties.ytdlp(), properties.dataDir(), gemini);
        return new TranslationService(props, profiles, translator, videos, cues, vietsub, tx, executor);
    }
}
