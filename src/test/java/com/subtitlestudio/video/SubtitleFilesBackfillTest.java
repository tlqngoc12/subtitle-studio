package com.subtitlestudio.video;

import static org.assertj.core.api.Assertions.assertThat;

import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SrtWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
class SubtitleFilesBackfillTest {

    private static final Instant AT = Instant.parse("2026-11-02T10:00:00Z");

    @Autowired
    private VideoRepository videos;

    @Autowired
    private CueRepository cues;

    @Autowired
    private ViCueRepository viCues;

    @TempDir
    private Path subs;

    private SubtitleFilesBackfill backfill() {
        return new SubtitleFilesBackfill(videos, cues, viCues, new SrtWriter(), new SubtitleFileStore(subs));
    }

    private Video video(String id, ViSource source) {
        Video v = new Video(id);
        v.update("t", null, 60, "en", SourceType.MANUAL, 1, AT);
        Video saved = videos.save(v);
        cues.save(new CueEntity(saved, 0, 1_000, 2_000, "Hello"));
        if (source != null) {
            viCues.save(new ViCueEntity(saved, 0, 1_000, 2_000, "Xin chào"));
            saved.updateVietsub(1, AT, source);
        }
        videos.flush();
        return saved;
    }

    @Test
    void createsMissingEnglishAndManualFiles() throws IOException {
        video("MANUALVIDEO", ViSource.MANUAL);
        video("AUTOVIDEO01", ViSource.AUTO);

        backfill().run();

        assertThat(Files.readString(subs.resolve("MANUALVIDEO.en.srt"))).contains("Hello");
        assertThat(Files.readString(subs.resolve("MANUALVIDEO.vi_manual.srt"))).contains("Xin chào");
        assertThat(subs.resolve("AUTOVIDEO01.en.srt")).exists();
        assertThat(subs.resolve("AUTOVIDEO01.vi_manual.srt")).doesNotExist();
    }

    @Test
    void keepsExistingFiles() throws IOException {
        video("MANUALVIDEO", ViSource.MANUAL);
        Files.createDirectories(subs);
        Files.writeString(subs.resolve("MANUALVIDEO.en.srt"), "original en");
        Files.writeString(subs.resolve("MANUALVIDEO.vi_manual.srt"), "original upload", StandardCharsets.UTF_8);

        backfill().run();

        assertThat(Files.readString(subs.resolve("MANUALVIDEO.en.srt"))).isEqualTo("original en");
        assertThat(Files.readString(subs.resolve("MANUALVIDEO.vi_manual.srt"))).isEqualTo("original upload");
    }
}
