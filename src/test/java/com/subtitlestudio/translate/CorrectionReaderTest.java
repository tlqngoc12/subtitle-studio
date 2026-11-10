package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.translate.CorrectionReader.Correction;
import com.subtitlestudio.video.CueEntity;
import com.subtitlestudio.video.CueRepository;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({CorrectionReader.class, SrtParser.class, SubtitleFileStore.class, CorrectionReaderTest.Config.class})
class CorrectionReaderTest {

    private static final Path DATA_DIR = createDataDir();

    @DynamicPropertySource
    static void dataDir(DynamicPropertyRegistry registry) {
        registry.add("subtitle-studio.data-dir", DATA_DIR::toString);
    }

    private static Path createDataDir() {
        try {
            return Files.createTempDirectory("correction-reader-test");
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @TestConfiguration
    @EnableConfigurationProperties(SubtitleStudioProperties.class)
    static class Config {}

    @Autowired
    private CorrectionReader reader;
    @Autowired
    private VideoRepository videos;
    @Autowired
    private CueRepository cues;
    @Autowired
    private ViCueRepository viCues;
    @Autowired
    private SubtitleFileStore files;

    private Video video(String id, int lines) {
        Video v = new Video(id);
        v.update("t", "c", 600, "en", SourceType.MANUAL, lines, Instant.parse("2026-11-01T00:00:00Z"));
        v.updateVietsub(lines, Instant.parse("2026-11-02T00:00:00Z"), ViSource.MANUAL);
        Video saved = videos.save(v);
        for (int i = 0; i < lines; i++) {
            cues.save(new CueEntity(saved, i, i * 1_000L, i * 1_000L + 900, "en " + i));
            viCues.save(new ViCueEntity(saved, i, i * 1_000L, i * 1_000L + 900, "final " + i));
        }
        videos.flush();
        return saved;
    }

    private void ai(String id, String... texts) {
        StringBuilder srt = new StringBuilder();
        for (int i = 0; i < texts.length; i++) {
            srt.append(i + 1).append('\n').append(timing(i * 1_000L)).append(" --> ")
                    .append(timing(i * 1_000L + 900)).append('\n').append(texts[i]).append("\n\n");
        }
        files.writeViAuto(id, srt.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String timing(long ms) {
        return String.format(Locale.ROOT, "00:%02d:%02d,%03d", ms / 60_000, ms / 1_000 % 60, ms % 1_000);
    }

    @Test
    void matchesTheThreeVersionsByStartTime() {
        video("MATCH000001", 2);
        ai("MATCH000001", "ai 0", "final 1");

        List<Correction> all = reader.read("MATCH000001");

        assertThat(all).containsExactly(new Correction("en 0", "ai 0", "final 0"),
                new Correction("en 1", "final 1", "final 1"));
    }

    @Test
    void readCorrectedKeepsOnlyChangedLinesIgnoringWhitespace() {
        video("CORR0000001", 3);
        ai("CORR0000001", "ai 0", "  final   1 ", "final 2");

        assertThat(reader.readCorrected("CORR0000001")).containsExactly(new Correction("en 0", "ai 0", "final 0"));
    }

    @Test
    void noOrBrokenAiFileGivesNoCorrections() throws IOException {
        video("NOAI0000001", 2);
        video("BROKEN00001", 2);
        Files.createDirectories(DATA_DIR.resolve("subs"));
        Files.write(DATA_DIR.resolve("subs/BROKEN00001.vi_auto.srt"), new byte[] {(byte) 0xff, (byte) 0xfe, 0x41});

        assertThat(reader.readCorrected("NOAI0000001")).isEmpty();
        assertThat(reader.readCorrected("BROKEN00001")).isEmpty();
        assertThat(reader.read("NOAI0000001")).hasSize(2).allMatch(c -> c.ai() == null);
    }
}
