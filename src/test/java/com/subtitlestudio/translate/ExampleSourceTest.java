package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.video.CueEntity;
import com.subtitlestudio.video.CueRepository;
import com.subtitlestudio.video.EditStatus;
import com.subtitlestudio.video.SubtitleFileStore;
import com.subtitlestudio.video.ViCueEntity;
import com.subtitlestudio.video.ViCueRepository;
import com.subtitlestudio.video.ViSource;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoRepository;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({ExampleSource.class, CorrectionReader.class, SrtParser.class, SubtitleFileStore.class, ExampleSourceTest.Config.class})
@ExtendWith(OutputCaptureExtension.class)
class ExampleSourceTest {

    private static final String PROFILE = "Moonshadow";
    private static final Path DATA_DIR = createDataDir();

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    private static Path createDataDir() {
        try {
            return Files.createTempDirectory("example-source-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @TestConfiguration
    @EnableConfigurationProperties(SubtitleStudioProperties.class)
    static class Config {}

    @Autowired
    private ExampleSource source;

    @Autowired
    private VideoRepository videos;

    @Autowired
    private CueRepository cues;

    @Autowired
    private ViCueRepository viCues;

    @Autowired
    private SubtitleFileStore files;

    /** A finished episode: English line i at i seconds, final Vietnamese "tiếng việt id i" at the same start. */
    private Video episode(String id, String profile, ViSource viSource, EditStatus status, String updatedAt, int lines) {
        Video v = new Video(id);
        v.update("t " + id, "c", 600, "en", SourceType.MANUAL, lines, Instant.parse("2026-11-01T00:00:00Z"));
        v.translationSucceeded(profile, "m");
        v.updateVietsub(lines, Instant.parse(updatedAt), viSource);
        v.setEditStatus(status);
        Video saved = videos.save(v);
        for (int i = 0; i < lines; i++) {
            cues.save(new CueEntity(saved, i, i * 1_000L, i * 1_000L + 900, "english " + id + " " + i));
            viCues.save(new ViCueEntity(saved, i, i * 1_000L, i * 1_000L + 900, "tiếng việt " + id + " " + i));
        }
        videos.flush();
        return saved;
    }

    private Video done(String id, String updatedAt, int lines) {
        return episode(id, PROFILE, ViSource.MANUAL, EditStatus.DONE, updatedAt, lines);
    }

    private static List<String> ens(List<ExamplePair> pairs) {
        return pairs.stream().map(ExamplePair::en).toList();
    }

    @Test
    void usesOnlyDoneManualVideosOfTheSameProfileAndNotTheVideoItself() {
        done("DONE0000001", "2026-11-05T00:00:00Z", 1);
        episode("OTHERPROF01", "Other", ViSource.MANUAL, EditStatus.DONE, "2026-11-05T00:00:00Z", 1);
        episode("INPROGRESS1", PROFILE, ViSource.MANUAL, EditStatus.IN_PROGRESS, "2026-11-05T00:00:00Z", 1);
        episode("NOTEDITED01", PROFILE, ViSource.MANUAL, null, "2026-11-05T00:00:00Z", 1);
        episode("AUTOVIETSUB", PROFILE, ViSource.AUTO, EditStatus.DONE, "2026-11-05T00:00:00Z", 1);
        done("SELF0000001", "2026-11-05T00:00:00Z", 1);

        List<ExamplePair> pairs = source.examplesFor(PROFILE, "SELF0000001");

        assertThat(ens(pairs)).containsExactly("english DONE0000001 0");
        assertThat(pairs.get(0).vi()).isEqualTo("tiếng việt DONE0000001 0");
    }

    @Test
    void takesAtMostThreeVideosNewestFirst() {
        done("OLDEST00001", "2026-11-01T00:00:00Z", 1);
        done("SECOND00001", "2026-11-02T00:00:00Z", 1);
        done("THIRD000001", "2026-11-03T00:00:00Z", 1);
        done("NEWEST00001", "2026-11-04T00:00:00Z", 1);

        List<ExamplePair> pairs = source.examplesFor(PROFILE, "SELF0000001");

        assertThat(ens(pairs)).containsExactly("english NEWEST00001 0", "english THIRD000001 0", "english SECOND00001 0");
    }

    @Test
    void pairsLinesByStartTimeAndSkipsVietsubLinesWithoutEnglish() {
        Video v = done("PAIRS000001", "2026-11-04T00:00:00Z", 2);
        viCues.save(new ViCueEntity(v, 2, 77_000, 78_000, "không có tiếng Anh"));
        videos.flush();

        List<ExamplePair> pairs = source.examplesFor(PROFILE, "SELF0000001");

        assertThat(pairs).hasSize(2);
        assertThat(pairs).noneMatch(p -> p.vi().contains("không có"));
    }

    @Test
    void handCorrectedLinesWinWhenThereAreTooManyCandidates(CapturedOutput output) {
        done("BIG00000001", "2026-11-04T00:00:00Z", 100);
        // The AI's version differs from the final one only for lines 95..99.
        StringBuilder srt = new StringBuilder();
        for (int i = 0; i < 100; i++) {
            String vi = i >= 95 ? "ai sai " + i : "tiếng việt BIG00000001 " + i;
            srt.append(i + 1).append('\n')
                    .append(timing(i * 1_000L)).append(" --> ").append(timing(i * 1_000L + 900)).append('\n')
                    .append(vi).append("\n\n");
        }
        files.writeViAuto("BIG00000001", srt.toString().getBytes(StandardCharsets.UTF_8));

        List<ExamplePair> pairs = source.examplesFor(PROFILE, "SELF0000001");

        assertThat(pairs).hasSize(ExampleSelector.MAX_PAIRS);
        assertThat(ens(pairs)).contains("english BIG00000001 95", "english BIG00000001 99");
        assertThat(output).contains("examples: 60 pairs from 1 videos (5 corrected)")
                .doesNotContain("english BIG").doesNotContain("tiếng việt");
    }

    @Test
    void worksWithoutOrWithAnUnreadableAutoFile() throws IOException {
        done("NOAUTO00001", "2026-11-04T00:00:00Z", 2);
        done("BROKEN00001", "2026-11-03T00:00:00Z", 2);
        Files.createDirectories(DATA_DIR.resolve("subs"));
        Files.write(DATA_DIR.resolve("subs/BROKEN00001.vi_auto.srt"), new byte[] {(byte) 0xff, (byte) 0xfe, 0x41});

        List<ExamplePair> pairs = source.examplesFor(PROFILE, "SELF0000001");

        assertThat(pairs).hasSize(4);
    }

    @Test
    void noMatchingVideosGivesNoExamples() {
        assertThat(source.examplesFor(PROFILE, "SELF0000001")).isEmpty();
    }

    private static String timing(long ms) {
        return String.format(Locale.ROOT, "00:%02d:%02d,%03d", ms / 60_000, ms / 1_000 % 60, ms % 1_000);
    }
}
