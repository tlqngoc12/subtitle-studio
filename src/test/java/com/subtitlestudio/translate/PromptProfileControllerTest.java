package com.subtitlestudio.translate;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.ProfileAnalyzer.Analysis;
import com.subtitlestudio.translate.ProfileAnalyzer.BasedOn;
import com.subtitlestudio.translate.ProfileAnalyzer.Details;
import com.subtitlestudio.translate.ProfileAnalyzer.Rule;
import com.subtitlestudio.translate.ProfileAnalyzer.Stats;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PromptProfileController.class)
class PromptProfileControllerTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private PromptProfileStore store;

    @MockitoBean
    private ProfileAnalyzer analyzer;

    @MockitoBean
    private SubtitleStudioProperties properties;

    private static SubtitleStudioProperties.Gemini gemini(String key) {
        return new SubtitleStudioProperties.Gemini(key, "gemini-3.8-flash", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3, List.of());
    }

    @Test
    void listsProfilesAndConfiguredFlag() throws Exception {
        when(store.list()).thenReturn(List.of("EmiBonnie"));
        when(properties.gemini()).thenReturn(gemini("k"));

        mvc.perform(get("/api/prompt-profiles"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"configured\":true,\"profiles\":[\"EmiBonnie\"]}", true));
    }

    @Test
    void reportsNotConfigured() throws Exception {
        when(store.list()).thenReturn(List.of());
        when(properties.gemini()).thenReturn(gemini(""));

        mvc.perform(get("/api/prompt-profiles"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"configured\":false,\"profiles\":[]}", true));
    }

    @Test
    void getReturnsTextShaAndStats() throws Exception {
        when(analyzer.details("EmiBonnie")).thenReturn(new Details("EmiBonnie", "text", "abc", new Stats(34, 612)));

        mvc.perform(get("/api/prompt-profiles/EmiBonnie"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"name\":\"EmiBonnie\",\"text\":\"text\",\"sha\":\"abc\","
                        + "\"stats\":{\"videos\":34,\"correctedLines\":612}}", true));
    }

    @Test
    void getUnknownProfileIs400() throws Exception {
        when(analyzer.details("nope")).thenThrow(new UnknownProfileException("nope"));

        mvc.perform(get("/api/prompt-profiles/nope"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("UNKNOWN_PROFILE"));
    }

    @Test
    void analyzeReturnsTheProposal() throws Exception {
        when(analyzer.analyze("EmiBonnie")).thenReturn(new Analysis("new text", List.of(new Rule("r", 3)),
                new BasedOn(2, 10), "gemini-x", "abc"));

        mvc.perform(post("/api/prompt-profiles/EmiBonnie/analyze"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"proposed\":\"new text\",\"rules\":[{\"text\":\"r\",\"count\":3}],"
                        + "\"basedOn\":{\"videos\":2,\"lines\":10},\"model\":\"gemini-x\",\"sha\":\"abc\"}", true));
    }

    @Test
    void analyzeErrorsMapToCodes() throws Exception {
        when(analyzer.analyze("a")).thenThrow(new NoCorrectionsException("none"));
        when(analyzer.analyze("b")).thenThrow(new AnalysisInvalidException("bad"));
        when(analyzer.analyze("c")).thenThrow(new GeminiNotConfiguredException("c"));
        when(analyzer.analyze("d")).thenThrow(new TranslationFailedException("Gemini is busy right now"));

        mvc.perform(post("/api/prompt-profiles/a/analyze")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NO_CORRECTIONS"));
        mvc.perform(post("/api/prompt-profiles/b/analyze")).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("ANALYSIS_INVALID"));
        mvc.perform(post("/api/prompt-profiles/c/analyze")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("GEMINI_NOT_CONFIGURED"));
        mvc.perform(post("/api/prompt-profiles/d/analyze")).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("GEMINI_FAILED"))
                .andExpect(jsonPath("$.detail").value("Gemini is busy right now"));
    }

    @Test
    void saveReturnsTheNewSha() throws Exception {
        when(store.write("EmiBonnie", "new", "old")).thenReturn("fresh");

        mvc.perform(put("/api/prompt-profiles/EmiBonnie").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"new\",\"baseSha\":\"old\"}"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"sha\":\"fresh\"}", true));
    }

    @Test
    void saveErrorsMapToCodes() throws Exception {
        when(store.write("a", "x", "s")).thenThrow(new ProfileChangedException("changed"));
        when(store.write("b", "x", "s")).thenThrow(new InvalidProfileTextException("empty"));
        when(store.write("_example", "x", "s")).thenThrow(new UnknownProfileException("_example"));
        String body = "{\"text\":\"x\",\"baseSha\":\"s\"}";

        mvc.perform(put("/api/prompt-profiles/a").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("PROFILE_CHANGED"));
        mvc.perform(put("/api/prompt-profiles/b").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PROFILE_TEXT"));
        mvc.perform(put("/api/prompt-profiles/_example").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNKNOWN_PROFILE"));
    }
}
