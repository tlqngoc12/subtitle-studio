package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.subtitle.SrtWriter;
import com.subtitlestudio.test.MutableClock;
import com.subtitlestudio.translate.TranslationInProgressException;
import com.subtitlestudio.url.UrlParser;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/** {@link VietsubService#saveText}: the live editor saves edited text of the stored Vietsub as MANUAL. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({VietsubService.class, SrtParser.class, SrtWriter.class, UrlParser.class, SubtitleFileStore.class,
        VietsubTextSaveTest.Config.class})
class VietsubTextSaveTest {

    private static final String ID = "dQw4w9WgXcQ";
    private static final String URL = "https://youtu.be/" + ID;
    private static final Instant NOW = Instant.parse("2026-11-09T10:00:00Z");
    private static final Path DATA_DIR = createTempDir();
    private static final Path SUBS_DIR = DATA_DIR.resolve("subs");

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    private static Path createTempDir() {
        try {
            return Files.createTempDirectory("vietsub-text-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @TestConfiguration
    @EnableConfigurationProperties(SubtitleStudioProperties.class)
    static class Config {
        @Bean
        MutableClock clock() {
            return new MutableClock(NOW);
        }
    }

    @MockitoBean
    private SubtitleService subtitleService;

    @Autowired
    private VietsubService service;

    @Autowired
    private VideoRepository videos;

    @Autowired
    private MutableClock clock;

    @Autowired
    private TestEntityManager em;

    @BeforeEach
    void setUp() {
        clock.reset();
    }

    private void saveVideo() {
        Video v = new Video(ID);
        v.update("Title", "Channel", 60, "en", SourceType.MANUAL, 1, NOW);
        videos.saveAndFlush(v);
    }

    private void seedUpload() {
        saveVideo();
        String srt = "1\n00:00:01,000 --> 00:00:02,000\nXin chào\n\n2\n00:00:03,500 --> 00:00:04,250\nTạm biệt\n\n";
        service.add(URL, srt.getBytes(StandardCharsets.UTF_8));
        reload();
    }

    private void seedAuto() {
        saveVideo();
        service.saveAuto(ID, List.of(new ViCue(1_000, 2_000, "Chào"), new ViCue(3_500, 4_250, "Tạm biệt")), "p");
        reload();
    }

    private void reload() {
        em.flush();
        em.clear();
    }

    private Instant stored() {
        return videos.findById(ID).orElseThrow().getViUpdatedAt();
    }

    private static VietsubTextRequest request(Instant base, String... texts) {
        List<VietsubTextRequest.LineText> lines = new ArrayList<>();
        for (int i = 0; i < texts.length; i++) {
            lines.add(new VietsubTextRequest.LineText(i, texts[i]));
        }
        return new VietsubTextRequest(base, lines);
    }

    @Test
    void replacesTextKeepsTimingAndMarksManual() {
        seedAuto();
        Instant base = stored();
        clock.advance(Duration.ofMinutes(5));

        Video saved = service.saveText(ID, request(base, "Xin chào", "  Hẹn gặp lại  "));
        reload();

        assertThat(service.getCues(ID)).containsExactly(
                new ViCue(1_000, 2_000, "Xin chào"),
                new ViCue(3_500, 4_250, "Hẹn gặp lại"));
        Video video = videos.findById(ID).orElseThrow();
        assertThat(video.getViSource()).isEqualTo(ViSource.MANUAL);
        assertThat(video.getViUpdatedAt()).isEqualTo(NOW.plus(Duration.ofMinutes(5)));
        assertThat(saved.getViSource()).isEqualTo(ViSource.MANUAL);
        assertThat(video.getViCueCount()).isEqualTo(2);
    }

    @Test
    void writesManualSrtFromTheCuesAndKeepsAutoFile() throws IOException {
        seedUpload();
        Files.writeString(SUBS_DIR.resolve(ID + ".vi_auto.srt"), "history");

        service.saveText(ID, request(stored(), "Một", "Hai\nba"));

        assertThat(Files.readString(SUBS_DIR.resolve(ID + ".vi_manual.srt"), StandardCharsets.UTF_8)).isEqualTo(
                "1\r\n00:00:01,000 --> 00:00:02,000\r\nMột\r\n\r\n"
                        + "2\r\n00:00:03,500 --> 00:00:04,250\r\nHai\r\nba\r\n\r\n");
        assertThat(Files.readString(SUBS_DIR.resolve(ID + ".vi_auto.srt"))).isEqualTo("history");
    }

    @Test
    void staleBaseReturnsConflictAndChangesNothing() {
        seedUpload();
        Instant stale = stored().minusSeconds(1);

        assertThatThrownBy(() -> service.saveText(ID, request(stale, "A", "B")))
                .isInstanceOf(VietsubChangedException.class);
        reload();

        assertThat(service.getCues(ID)).extracting(ViCue::text).containsExactly("Xin chào", "Tạm biệt");
        assertThat(videos.findById(ID).orElseThrow().getViUpdatedAt()).isEqualTo(NOW);
    }

    @Test
    void wrongCountIsRejected() {
        seedUpload();
        Instant base = stored();

        assertThatThrownBy(() -> service.saveText(ID, request(base, "only one")))
                .isInstanceOf(InvalidVietsubTextException.class);
        assertThatThrownBy(() -> service.saveText(ID, request(base, "a", "b", "c")))
                .isInstanceOf(InvalidVietsubTextException.class);
    }

    @Test
    void wrongOrderIsRejected() {
        seedUpload();
        var swapped = new VietsubTextRequest(stored(), List.of(
                new VietsubTextRequest.LineText(1, "a"), new VietsubTextRequest.LineText(0, "b")));

        assertThatThrownBy(() -> service.saveText(ID, swapped)).isInstanceOf(InvalidVietsubTextException.class);
    }

    @Test
    void emptyAndTooLongTextGiveFieldErrorsAndChangeNothing() {
        seedUpload();

        assertThatThrownBy(() -> service.saveText(ID, request(stored(), "   ", "x".repeat(1001))))
                .isInstanceOfSatisfying(InvalidVietsubTextException.class, e ->
                        assertThat(e.errors()).extracting(FieldError::field)
                                .containsExactly("lines[0].text", "lines[1].text"));
        reload();

        assertThat(service.getCues(ID)).extracting(ViCue::text).containsExactly("Xin chào", "Tạm biệt");
        assertThat(videos.findById(ID).orElseThrow().getViUpdatedAt()).isEqualTo(NOW);
    }

    @Test
    void exactly1000CharactersIsAccepted() {
        seedUpload();

        service.saveText(ID, request(stored(), "x".repeat(1000), "ok"));
        reload();

        assertThat(service.getCues(ID).get(0).text()).hasSize(1000);
    }

    @Test
    void unknownVideoAndVideoWithoutVietsub() {
        assertThatThrownBy(() -> service.saveText("UNKNOWN0001", request(NOW, "a")))
                .isInstanceOf(VideoNotFoundException.class);

        saveVideo();
        assertThatThrownBy(() -> service.saveText(ID, request(NOW, "a"))).isInstanceOf(NoVietsubException.class);
    }

    @Test
    void runningTranslationReturnsConflictAndChangesNothing() {
        seedAuto();
        Instant base = stored();
        assertThat(videos.markTranslating(ID, "p")).isEqualTo(1);

        assertThatThrownBy(() -> service.saveText(ID, request(base, "A", "B")))
                .isInstanceOf(TranslationInProgressException.class);
        reload();

        assertThat(service.getCues(ID)).extracting(ViCue::text).containsExactly("Chào", "Tạm biệt");
        assertThat(videos.findById(ID).orElseThrow().getViSource()).isEqualTo(ViSource.AUTO);
    }

    @Test
    void laterAutoTranslationDoesNotOverwriteTheManualSave() {
        seedAuto();
        service.saveText(ID, request(stored(), "Của tôi", "Sửa tay"));
        reload();

        boolean replaced = service.saveAuto(ID, List.of(new ViCue(1_000, 2_000, "Máy dịch")), "p");
        reload();

        assertThat(replaced).isFalse();
        assertThat(service.getCues(ID)).extracting(ViCue::text).containsExactly("Của tôi", "Sửa tay");
    }
}
