package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@Import({NovelExportService.class, NovelExportServiceTest.Config.class})
@ExtendWith(OutputCaptureExtension.class)
class NovelExportServiceTest {

    static final Instant NOW = Instant.parse("2026-11-18T03:00:00Z");

    @TestConfiguration
    static class Config {
        @Bean
        Clock clock() {
            return Clock.fixed(NOW, ZoneOffset.UTC);
        }
    }

    @Autowired
    private NovelExportService service;

    @Autowired
    private NovelRepository novels;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private ChapterPageRepository pages;

    @Autowired
    private MediaRepository media;

    private Novel novel;

    @BeforeEach
    void setUp() {
        novel = novels.save(new Novel("summer-love", "Tình Yêu Mùa Hạ", NovelStatus.ONGOING, NOW));
    }

    private Chapter chapter(int no, int sort, String textVi) {
        Chapter c = new Chapter(novel, no, null, NOW);
        c.setSortOrder(sort);
        c.setTextVi(textVi);
        return chapters.saveAndFlush(c);
    }

    private void page(Chapter c, int position, String text) {
        ChapterPage p = new ChapterPage(c, position, media.save(new Media("image/png", 1, "p.png", NOW)));
        p.setTextVi(text);
        pages.saveAndFlush(p);
    }

    private static Map<String, String> unzip(byte[] zip) throws IOException {
        Map<String, String> out = new LinkedHashMap<>();
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip), StandardCharsets.UTF_8)) {
            for (ZipEntry e = in.getNextEntry(); e != null; e = in.getNextEntry()) {
                out.put(e.getName(), new String(in.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        return out;
    }

    @Test
    void exportsChaptersWithTextInReadingOrder() throws Exception {
        chapter(1, 1, "A");
        chapter(2, 2, null);
        Chapter c3 = chapter(3, 3, null);
        c3.setTranslationStatus(ChapterTranslationStatus.TRANSLATING);
        chapters.saveAndFlush(c3);
        page(c3, 2, "P2");
        page(c3, 1, "P1");

        NovelExportService.NovelExport export = service.export(novel.getId());

        assertThat(export.fileName()).isEqualTo("summer-love-" + java.time.LocalDate.ofInstant(NOW, java.time.ZoneId.systemDefault()) + ".zip");
        Map<String, String> files = unzip(export.zip());
        assertThat(new ArrayList<>(files.keySet())).containsExactly("001 - Chapter 1.md", "001 - Chapter 1.html",
                "002 - Chapter 3.md", "002 - Chapter 3.html");
        assertThat(files.get("002 - Chapter 3.md")).endsWith("P1\n\nP2");
        assertThat(files.get("001 - Chapter 1.html")).contains("<p>A</p>");
    }

    @Test
    void throwsWhenNothingHasText() {
        chapter(1, 1, null);
        chapter(2, 2, "  ");

        assertThatThrownBy(() -> service.export(novel.getId())).isInstanceOf(NothingToExportException.class);
    }

    @Test
    void unknownNovel() {
        assertThatThrownBy(() -> service.export(999_999L)).isInstanceOf(NovelNotFoundException.class);
    }

    @Test
    void logsNoChapterText(CapturedOutput output) {
        chapter(1, 1, "Bí mật không được ghi log");

        service.export(novel.getId());

        assertThat(output.getAll()).contains("Exported novel").doesNotContain("Bí mật không được ghi log");
    }

    @Test
    void exportsOneChapterAsMdAndHtml() throws Exception {
        Chapter c3 = chapter(3, 3, "Xin chào");

        NovelExportService.NovelExport export = service.exportChapter(c3.getId());

        assertThat(export.fileName()).isEqualTo("summer-love-chapter-3-"
                + java.time.LocalDate.ofInstant(NOW, java.time.ZoneId.systemDefault()) + ".zip");
        Map<String, String> files = unzip(export.zip());
        assertThat(files).hasSize(2);
        List<String> names = new ArrayList<>(files.keySet());
        assertThat(names.get(0)).endsWith(".md");
        assertThat(names.get(1)).endsWith(".html");
        String heading = ChapterExportFormat.heading(3, null, null);
        assertThat(files.get(names.get(0))).contains(ChapterExportFormat.markdown(heading, "Xin chào"));
    }

    @Test
    void exportChapterWithoutTextThrows() {
        Chapter c = chapter(1, 1, null);

        assertThatThrownBy(() -> service.exportChapter(c.getId())).isInstanceOf(NothingToExportException.class);
    }

    @Test
    void exportChapterUnknownThrows() {
        assertThatThrownBy(() -> service.exportChapter(999_999L)).isInstanceOf(ChapterNotFoundException.class);
    }
}
