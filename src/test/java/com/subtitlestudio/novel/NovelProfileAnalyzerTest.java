package com.subtitlestudio.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.novel.NovelProfileAnalyzer.Analysis;
import com.subtitlestudio.novel.NovelProfileAnalyzer.BasedOn;
import com.subtitlestudio.novel.NovelProfileAnalyzer.Rule;
import com.subtitlestudio.novel.NovelProfileAnalyzer.Stats;
import com.subtitlestudio.novel.NovelProfileAnalyzer.Term;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.translate.AnalysisInvalidException;
import com.subtitlestudio.translate.FakeGeminiServer;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.translate.GeminiNotConfiguredException;
import com.subtitlestudio.translate.NoCorrectionsException;
import com.subtitlestudio.translate.PromptProfileStore;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.ActiveProfiles;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
class NovelProfileAnalyzerTest {

    private static final Instant T0 = Instant.parse("2026-11-05T10:00:00Z");
    private static final String ANSWER = "{\"proposed\":\"# P\",\"rules\":[{\"text\":\"r\",\"count\":2}],"
            + "\"terms\":[{\"kind\":\"term\",\"text\":\"Ms. Ellis → cô Ellis\",\"count\":3}]}";

    @TempDir
    Path dataDir;

    @Autowired
    private NovelRepository novels;

    @Autowired
    private ChapterRepository chapters;

    @Autowired
    private ChapterPageRepository pages;

    @Autowired
    private MediaRepository media;

    private final FakeGeminiServer server = new FakeGeminiServer();
    private Novel novel;
    private int counter;

    @BeforeEach
    void setUp() throws IOException {
        Files.createDirectories(dataDir.resolve("prompts/novels"));
        Files.writeString(dataDir.resolve("prompts/novels/P.md"), "## Xưng hô\nA gọi B là em.");
        novel = novel("n1", "First", "P");
    }

    @AfterEach
    void stop() {
        server.close();
    }

    private Novel novel(String slug, String title, String profile) {
        Novel n = new Novel(slug, title, NovelStatus.ONGOING, T0);
        n.setPromptProfile(profile);
        return novels.save(n);
    }

    private SubtitleStudioProperties.Gemini gemini(String key) {
        return new SubtitleStudioProperties.Gemini(key, "gemini-test-flash", Duration.ofSeconds(10),
                Duration.ofMinutes(60), 0.3, List.of());
    }

    private NovelProfileStore store() {
        var props = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir, gemini("k"),
                new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)));
        return new NovelProfileStore(props, new PromptProfileStore(props));
    }

    private NovelProfileAnalyzer analyzer(String key) {
        SubtitleStudioProperties.Gemini g = gemini(key);
        return new NovelProfileAnalyzer(novels, chapters, pages, store(), new GeminiCaller(g, server.baseUrl()), g,
                new ObjectMapper());
    }

    /** A published, translated Wattpad-style chapter. */
    private Chapter chapter(Novel n, String source, String ai, String fin) {
        Chapter c = new Chapter(n, ++counter, null, T0);
        c.setSourceText(source);
        c.setAiText(ai);
        c.setTextVi(fin);
        c.setTranslationStatus(ChapterTranslationStatus.TRANSLATED);
        c.setPublishStatus(ChapterPublishStatus.PUBLISHED);
        c.setPublishedAt(T0.plusSeconds(counter));
        return chapters.save(c);
    }

    @Test
    void onlyPublishedTranslatedChaptersCount() {
        Chapter draft = chapter(novel, "s", "A\n\nB", "A\n\nB2");
        draft.setPublishStatus(ChapterPublishStatus.DRAFT);
        Chapter failed = chapter(novel, "s", "A\n\nB", "A\n\nB2");
        failed.setTranslationStatus(ChapterTranslationStatus.FAILED);
        chapter(novel("n2", "Other", "Q"), "s", "A\n\nB", "A\n\nB2");
        chapters.flush();

        assertThat(analyzer("k").details(novel.getId()).stats()).isEqualTo(new Stats(0, 0, List.of()));
    }

    @Test
    void wattpadChapterWithoutAiTextIsSkipped() {
        chapter(novel, "s1\n\ns2", null, "A\n\nB2");

        assertThat(analyzer("k").details(novel.getId()).stats().edits()).isZero();
    }

    @Test
    void screenshotChapterFallsBackToPageTexts() {
        Chapter c = chapter(novel, null, null, "A\n\nB2");
        for (int i = 1; i <= 2; i++) {
            ChapterPage p = new ChapterPage(c, i, media.save(new Media("image/png", 1, "p.png", T0)));
            p.setTextVi(i == 1 ? "A" : "B");
            pages.save(p);
        }

        assertThat(analyzer("k").details(novel.getId()).stats()).isEqualTo(new Stats(1, 1, List.of()));
    }

    @Test
    void imageMarkersAreNotCorrections() {
        chapter(novel, "s1\n\n[[image:7]]\n\ns2", "A\n\n[[image:7]]\n\nCard text\n\nB", "A\n\n[[image:7]]\n\nCard text\n\nB2");

        var stats = analyzer("k").details(novel.getId()).stats();

        assertThat(stats.edits()).isEqualTo(1);
    }

    @Test
    void aChapterOfOnlyMarkersHasNoEdits() {
        chapter(novel, "[[image:1]]\n\n[[image:2]]", "[[image:1]]\n\n[[image:2]]", "[[image:1]]\n\n[[image:2]]");

        assertThat(analyzer("k").details(novel.getId()).stats()).isEqualTo(new Stats(0, 0, List.of()));
    }

    @Test
    void neverEditedChapterHasNoEdits() {
        chapter(novel, "s", "A\n\nB", null);

        assertThat(analyzer("k").details(novel.getId()).stats()).isEqualTo(new Stats(0, 0, List.of()));
    }

    @Test
    void statsCountEveryEditAndNameOtherNovels() throws IOException {
        Novel other = novel("n2", "Be my Sugar!", "P");
        chapter(novel, "s", "A\n\nB\n\nC", "A2\n\nB\n\nC2");
        chapter(other, "s", "A\n\nB", "A\n\nB2");

        var details = analyzer("k").details(novel.getId());

        assertThat(details.name()).isEqualTo("P");
        assertThat(details.text()).startsWith("## Xưng hô");
        assertThat(details.sha()).isEqualTo(store().sha("P"));
        assertThat(details.geminiConfigured()).isTrue();
        assertThat(details.stats()).isEqualTo(new Stats(2, 3, List.of("Be my Sugar!")));
        assertThat(analyzer("").details(novel.getId()).geminiConfigured()).isFalse();
    }

    @Test
    void selectionStopsAt300EditsOrChars() {
        StringBuilder ai = new StringBuilder();
        StringBuilder fin = new StringBuilder();
        for (int i = 0; i < 250; i++) {
            ai.append("a").append(i).append("\n\n").append("same").append(i).append("\n\n");
            fin.append("b").append(i).append("\n\n").append("same").append(i).append("\n\n");
        }
        chapter(novel, null, "old", "old2");
        chapter(novel, null, ai.toString(), fin.toString());
        chapter(novel, null, ai.toString(), fin.toString());
        server.replyText(ANSWER, "STOP");

        Analysis a = analyzer("k").analyze(novel.getId());

        assertThat(analyzer("k").details(novel.getId()).stats().edits()).isEqualTo(501);
        assertThat(a.basedOn()).isEqualTo(new BasedOn(2, 300));
        assertThat(server.lastBody()).contains("(300)");

        NovelProfileAnalyzer.Selection byChars = NovelProfileAnalyzer.select(List.of(
                List.of(new NovelCorrections.Edit("s".repeat(400), "a".repeat(400), "f".repeat(400)),
                        new NovelCorrections.Edit(null, "a".repeat(400), "f".repeat(400))),
                List.of(new NovelCorrections.Edit(null, "x", "y"))), 1_700);
        assertThat(byChars.edits()).hasSize(1);
        assertThat(byChars.chapters()).isEqualTo(1);
    }

    @Test
    void longSideIsCutTo2000Chars() {
        chapter(novel, null, "A\n\n" + "x".repeat(3_000), "A\n\n" + "y".repeat(3_000));
        server.replyText(ANSWER, "STOP");

        analyzer("k").analyze(novel.getId());

        assertThat(server.lastBody()).contains("x".repeat(2_000) + "…").doesNotContain("x".repeat(2_001))
                .contains("y".repeat(2_000) + "…");
    }

    @Test
    void noEditsThrowsNoCorrectionsWithoutCallingGemini() {
        chapter(novel, "s", "A", null);

        assertThatThrownBy(() -> analyzer("k").analyze(novel.getId())).isInstanceOf(NoCorrectionsException.class);
        assertThat(server.requests()).isZero();
    }

    @Test
    void geminiNotConfiguredThrowsWithoutCallingGemini() {
        chapter(novel, null, "A", "B");

        assertThatThrownBy(() -> analyzer("").analyze(novel.getId())).isInstanceOf(GeminiNotConfiguredException.class);
        assertThat(server.requests()).isZero();
    }

    @Test
    void busyNovelThrowsTranslationBusy() {
        chapter(novel, null, "A", "B");
        Chapter busy = chapter(novel, null, null, null);
        busy.setTranslationStatus(ChapterTranslationStatus.TRANSLATING);
        chapters.flush();

        assertThatThrownBy(() -> analyzer("k").analyze(novel.getId())).isInstanceOf(NovelTranslationBusyException.class);
        assertThat(server.requests()).isZero();
    }

    @Test
    void novelWithoutAUsableProfileIsRejected() {
        Novel none = novel("n3", "None", null);
        Novel missing = novel("n4", "Missing", "Gone");

        assertThatThrownBy(() -> analyzer("k").details(none.getId())).isInstanceOf(NoNovelProfileException.class);
        assertThatThrownBy(() -> analyzer("k").details(missing.getId())).isInstanceOf(NoNovelProfileException.class);
        assertThatThrownBy(() -> analyzer("k").analyze(missing.getId())).isInstanceOf(NoNovelProfileException.class);
        assertThatThrownBy(() -> analyzer("k").details(9_999L)).isInstanceOf(NovelNotFoundException.class);
    }

    @Test
    void parsesProposedRulesAndTerms() {
        chapter(novel, null, "A\n\nB", "A\n\nB2");
        server.replyText(ANSWER, "STOP");

        Analysis a = analyzer("k").analyze(novel.getId());

        assertThat(a.proposed()).isEqualTo("# P");
        assertThat(a.rules()).containsExactly(new Rule("r", 2));
        assertThat(a.terms()).containsExactly(new Term("term", "Ms. Ellis → cô Ellis", 3));
        assertThat(a.basedOn()).isEqualTo(new BasedOn(1, 1));
        assertThat(a.model()).isEqualTo("gemini-test-flash");
        assertThat(a.sha()).isEqualTo(store().sha("P"));
        assertThat(server.requests()).isEqualTo(1);
    }

    @Test
    void invalidJsonOrEmptyOrOversizedProposalIsAnalysisInvalid() {
        chapter(novel, null, "A", "B");
        for (String bad : List.of("not json", "{\"rules\":[],\"terms\":[]}",
                "{\"proposed\":\"  \",\"rules\":[],\"terms\":[]}",
                "{\"proposed\":\"" + "x".repeat(20 * 1024 + 1) + "\",\"rules\":[],\"terms\":[]}")) {
            server.replyText(bad, "STOP");
            assertThatThrownBy(() -> analyzer("k").analyze(novel.getId())).isInstanceOf(AnalysisInvalidException.class);
        }
    }

    @Test
    void userTextHasSourceAiFinalAndNothingIsLogged(CapturedOutput output) {
        chapter(novel, "SRC-uno\n\nSRC-dos", "AI-uno\n\nAI-dos", "AI-uno\n\nFIN-dos");
        server.replyText(ANSWER, "STOP");

        analyzer("k").analyze(novel.getId());

        assertThat(server.lastBody()).contains("# Hồ sơ hiện tại").contains("A gọi B là em.")
                .contains("GỐC: SRC-dos").contains("AI: AI-dos").contains("FINAL: FIN-dos");
        assertThat(output).contains("gemini-test-flash").doesNotContain("SRC-dos").doesNotContain("AI-dos")
                .doesNotContain("FIN-dos").doesNotContain("gọi B là em");
    }

    @Test
    void emptySideIsWrittenAsBlankMarker() {
        chapter(novel, null, "A", "A\n\nNEW");
        server.replyText(ANSWER, "STOP");

        analyzer("k").analyze(novel.getId());

        assertThat(server.lastBody()).contains("AI: (trống)").contains("FINAL: NEW");
    }

    @Test
    void saveWritesThroughTheStoreWithTheSha() {
        NovelProfileAnalyzer a = analyzer("k");
        String sha = store().sha("P");

        String next = a.save(novel.getId(), "# New", sha);

        assertThat(next).isEqualTo(store().sha("P")).isNotEqualTo(sha);
        assertThat(store().read("P")).isEqualTo("# New");
    }

    @Test
    void systemRulesAskForCheckRules() {
        assertThat(NovelProfileAnalyzer.SYSTEM_RULES).contains("## Kiểm tra").contains("ít nhất 2 đoạn");
    }
}
