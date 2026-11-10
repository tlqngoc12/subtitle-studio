package com.subtitlestudio.translate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.CorrectionReader.Correction;
import com.subtitlestudio.translate.ProfileAnalyzer.Analysis;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoRepository;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ProfileAnalyzerTest {

    @TempDir
    private Path root;

    private final FakeGeminiServer server = new FakeGeminiServer();
    private final VideoRepository videos = mock(VideoRepository.class);
    private final CorrectionReader reader = mock(CorrectionReader.class);
    private final List<Video> found = new ArrayList<>();
    private PromptProfileStore store;

    @BeforeEach
    void setUp() throws IOException {
        Path prompts = Files.createDirectories(root.resolve("prompts"));
        Files.writeString(prompts.resolve("EmiBonnie.md"), "## Xưng hô\nEmi gọi Bonnie là em.");
        store = new PromptProfileStore(prompts);
        when(videos.findExampleVideos(eq("EmiBonnie"), eq(""), any())).thenReturn(found);
    }

    @AfterEach
    void stop() {
        server.close();
    }

    private ProfileAnalyzer analyzer(String apiKey) {
        var gemini = new SubtitleStudioProperties.Gemini(apiKey, "gemini-test-flash", Duration.ofSeconds(10),
                Duration.ofMinutes(60), 0.3, List.of());
        var props = mock(SubtitleStudioProperties.class);
        when(props.gemini()).thenReturn(gemini);
        return new ProfileAnalyzer(store, videos, reader, new GeminiCaller(gemini, server.baseUrl()), props,
                new ObjectMapper());
    }

    /** A matching video whose corrected lines are the given (en, ai, final) triples. */
    private void corrections(String videoId, String... enAiVi) {
        Video v = mock(Video.class);
        when(v.getId()).thenReturn(videoId);
        List<Correction> list = new ArrayList<>();
        for (int i = 0; i < enAiVi.length; i += 3) {
            list.add(new Correction(enAiVi[i], enAiVi[i + 1], enAiVi[i + 2]));
        }
        when(reader.readCorrected(videoId)).thenReturn(list);
        found.add(v);
    }

    @Test
    void detailsGiveTextShaAndStats() {
        corrections("V1", "a", "b", "c", "d", "e", "f");
        corrections("V2", "g", "h", "i");

        var details = analyzer("k").details("EmiBonnie");

        assertThat(details.text()).startsWith("## Xưng hô");
        assertThat(details.sha()).isEqualTo(store.sha("EmiBonnie"));
        assertThat(details.stats()).isEqualTo(new ProfileAnalyzer.Stats(2, 3));
    }

    @Test
    void sendsProfileAndCorrectionsInOneRequestAndParsesTheAnswer() {
        corrections("V1", "I miss you", "Tôi nhớ bạn", "Em nhớ chị");
        server.replyText("{\"rules\":[{\"text\":\"Emi xưng em\",\"count\":3}],"
                + "\"proposed\":\"## Xưng hô\\nEmi xưng em, gọi Bonnie là chị.\"}", "STOP");

        Analysis result = analyzer("k").analyze("EmiBonnie");

        assertThat(server.requests()).isEqualTo(1);
        assertThat(server.lastBody()).contains("Emi gọi Bonnie là em.").contains("I miss you")
                .contains("Tôi nhớ bạn").contains("Em nhớ chị").contains("responseSchema").contains("systemInstruction");
        assertThat(result.proposed()).contains("gọi Bonnie là chị");
        assertThat(result.rules()).containsExactly(new ProfileAnalyzer.Rule("Emi xưng em", 3));
        assertThat(result.basedOn()).isEqualTo(new ProfileAnalyzer.BasedOn(1, 1));
        assertThat(result.model()).isEqualTo("gemini-test-flash");
        assertThat(result.sha()).isEqualTo(store.sha("EmiBonnie"));
    }

    @Test
    void noCorrectedLinesFailsWithoutCallingGemini() {
        assertThatThrownBy(() -> analyzer("k").analyze("EmiBonnie")).isInstanceOf(NoCorrectionsException.class);
        assertThat(server.requests()).isZero();
    }

    @Test
    void geminiNotConfiguredFailsWithoutCallingGemini() {
        corrections("V1", "a", "b", "c");
        assertThatThrownBy(() -> analyzer("").analyze("EmiBonnie")).isInstanceOf(GeminiNotConfiguredException.class);
        assertThat(server.requests()).isZero();
    }

    @Test
    void unknownProfileIsRejected() {
        assertThatThrownBy(() -> analyzer("k").analyze("_example")).isInstanceOf(UnknownProfileException.class);
        assertThatThrownBy(() -> analyzer("k").details("../x")).isInstanceOf(UnknownProfileException.class);
    }

    @Test
    void badAnswersAreRejected() {
        corrections("V1", "a", "b", "c");
        for (String bad : List.of("not json", "{\"rules\":[]}", "{\"rules\":[],\"proposed\":\"  \"}",
                "{\"rules\":[],\"proposed\":\"" + "x".repeat(PromptProfileStore.MAX_BYTES + 1) + "\"}")) {
            server.replyText(bad, "STOP");
            assertThatThrownBy(() -> analyzer("k").analyze("EmiBonnie")).isInstanceOf(AnalysisInvalidException.class);
        }
    }

    @Test
    void geminiFailureSurfacesAsTranslationFailed() {
        corrections("V1", "a", "b", "c");
        server.reply(500, "{}");
        assertThatThrownBy(() -> analyzer("k").analyze("EmiBonnie")).isInstanceOf(TranslationFailedException.class);
    }

    @Test
    void selectionStopsAtTheLineLimitNewestVideoFirst() {
        List<Correction> big = new ArrayList<>();
        for (int i = 0; i < 250; i++) {
            big.add(new Correction("e" + i, "a", "v"));
        }
        List<Correction> next = new ArrayList<>();
        for (int i = 0; i < 100; i++) {
            next.add(new Correction("n" + i, "a", "v"));
        }

        var selection = ProfileAnalyzer.select(List.of(big, next, List.of(new Correction("z", "a", "v"))));

        assertThat(selection.lines()).hasSize(ProfileAnalyzer.MAX_LINES);
        assertThat(selection.lines().get(0).en()).isEqualTo("e0");
        assertThat(selection.lines().get(299).en()).isEqualTo("n49");
        assertThat(selection.videos()).isEqualTo(2);
    }

    @Test
    void selectionStopsAtTheCharacterLimit() {
        List<Correction> lines = new ArrayList<>();
        for (int i = 0; i < 40; i++) {
            lines.add(new Correction("x".repeat(400), "y".repeat(400), "z".repeat(400)));
        }

        var selection = ProfileAnalyzer.select(List.of(lines));

        assertThat(selection.lines()).hasSize(ProfileAnalyzer.MAX_CHARS / 1200);
        assertThat(selection.videos()).isEqualTo(1);
    }

    @Test
    void emptySelectionHasNoVideos() {
        assertThat(ProfileAnalyzer.select(List.of()).lines()).isEmpty();
        assertThat(ProfileAnalyzer.select(List.of()).videos()).isZero();
    }
}
