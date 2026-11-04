package com.subtitlestudio.video;

import static org.mockito.Mockito.inOrder;
import static org.mockito.ArgumentMatchers.anyString;
import com.subtitlestudio.translate.VietsubManualException;
import com.subtitlestudio.translate.VideoTooLongException;
import com.subtitlestudio.translate.UnknownProfileException;
import com.subtitlestudio.translate.TranslationService;
import com.subtitlestudio.translate.TranslationInProgressException;
import com.subtitlestudio.translate.SkipReason;
import com.subtitlestudio.translate.PromptProfileStore;
import com.subtitlestudio.translate.GeminiNotConfiguredException;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.subtitle.Cue;
import com.subtitlestudio.subtitle.NoEnglishSubtitleException;
import com.subtitlestudio.subtitle.SourceType;
import com.subtitlestudio.subtitle.SrtWriter;
import com.subtitlestudio.subtitle.VttParseException;
import com.subtitlestudio.url.InvalidUrlException;
import com.subtitlestudio.web.ApiExceptionHandler;
import com.subtitlestudio.ytdlp.YtDlpFailedException;
import com.subtitlestudio.ytdlp.YtDlpTimeoutException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

@WebMvcTest(VideoController.class)
@Import({SrtWriter.class, ApiExceptionHandler.class})
class VideoControllerTest {

    private static final String ID = "dQw4w9WgXcQ";

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private SubtitleService service;

    @MockitoBean
    private PromptProfileStore profiles;

    @MockitoBean
    private TranslationService translation;

    @Nested
    class Fetch {

        @Test
        void newVideoReturns201WithLocationAndBody() throws Exception {
            when(service.fetch("https://youtu.be/" + ID)).thenReturn(new FetchResult(video(), true));

            postUrl("https://youtu.be/" + ID)
                    .andExpect(status().isCreated())
                    .andExpect(header().string("Location", "/api/videos/" + ID))
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                    .andExpect(jsonPath("$.id").value(ID))
                    .andExpect(jsonPath("$.title").value("Học Spring Boot"))
                    .andExpect(jsonPath("$.channel").value("Dev Channel"))
                    .andExpect(jsonPath("$.durationSec").value(754))
                    .andExpect(jsonPath("$.subLang").value("en-orig"))
                    .andExpect(jsonPath("$.subSource").value("AUTO"))
                    .andExpect(jsonPath("$.cueCount").value(2))
                    .andExpect(jsonPath("$.fetchedAt").value("2026-11-02T10:00:00Z"))
                    .andExpect(jsonPath("$.thumbnailUrl").value("https://i.ytimg.com/vi/" + ID + "/mqdefault.jpg"))
                    .andExpect(jsonPath("$.viCueCount").value(3))
                    .andExpect(jsonPath("$.viUpdatedAt").value("2026-11-02T11:00:00Z"));
        }

        @Test
        void existingVideoReturns200() throws Exception {
            when(service.fetch(ID)).thenReturn(new FetchResult(video(), false));

            postUrl(ID)
                    .andExpect(status().isOk())
                    .andExpect(header().doesNotExist("Location"))
                    .andExpect(jsonPath("$.id").value(ID));
        }

        @Test
        void invalidUrlReturns400ProblemWithCode() throws Exception {
            when(service.fetch("nope")).thenThrow(new InvalidUrlException("nope"));

            expectProblem(postUrl("nope"), 400, "INVALID_URL");
        }

        @Test
        void missingUrlIsPassedToParserAndReturnsInvalidUrl() throws Exception {
            when(service.fetch(null)).thenThrow(new InvalidUrlException("null"));

            expectProblem(mvc.perform(post("/api/videos").contentType(MediaType.APPLICATION_JSON).content("{}")),
                    400, "INVALID_URL");
        }

        @Test
        void noEnglishSubtitleReturns422() throws Exception {
            when(service.fetch(ID)).thenThrow(new NoEnglishSubtitleException(ID));

            expectProblem(postUrl(ID), 422, "NO_ENGLISH_SUBTITLE");
        }

        @Test
        void ytDlpFailureReturns502() throws Exception {
            when(service.fetch(ID)).thenThrow(new YtDlpFailedException("yt-dlp failed with exit code 1: Video unavailable"));

            expectProblem(postUrl(ID), 502, "YTDLP_FAILED")
                    .andExpect(jsonPath("$.detail").value(containsString("Video unavailable")));
        }

        @Test
        void unparsableSubtitleReturns502() throws Exception {
            when(service.fetch(ID)).thenThrow(new VttParseException("Missing WEBVTT header"));

            expectProblem(postUrl(ID), 502, "YTDLP_FAILED");
        }

        @Test
        void ytDlpTimeoutReturns504() throws Exception {
            when(service.fetch(ID)).thenThrow(new YtDlpTimeoutException("yt-dlp did not finish within 60s"));

            expectProblem(postUrl(ID), 504, "YTDLP_TIMEOUT");
        }

        @Test
        void malformedJsonReturns400() throws Exception {
            mvc.perform(post("/api/videos").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        }

        @Test
        void unexpectedErrorReturns500WithoutLeakingDetails() throws Exception {
            when(service.fetch(ID)).thenThrow(new IllegalStateException("secret internal path C:\\data"));

            expectProblem(postUrl(ID), 500, "INTERNAL_ERROR")
                    .andExpect(jsonPath("$.detail").value(not(containsString("secret"))));
        }

        private ResultActions postUrl(String url) throws Exception {
            return mvc.perform(post("/api/videos")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"url\":\"" + url + "\"}"));
        }
    }

    @Nested
    class Translate {

        private ResultActions postWithProfile(String profile) throws Exception {
            return mvc.perform(post("/api/videos")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"url\":\"" + ID + "\",\"profile\":\"" + profile + "\"}"));
        }

        private ResultActions translate(String profile) throws Exception {
            return mvc.perform(post("/api/videos/" + ID + "/translate")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"profile\":\"" + profile + "\"}"));
        }

        @Test
        void fetchWithoutProfileKeepsOldShape() throws Exception {
            when(service.fetch(ID)).thenReturn(new FetchResult(video(), false));

            mvc.perform(post("/api/videos").contentType(MediaType.APPLICATION_JSON).content("{\"url\":\"" + ID + "\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(ID))
                    .andExpect(jsonPath("$.skipReason").doesNotExist());
            verify(translation, never()).startFromFetch(anyString(), anyString());
        }

        @Test
        void blankProfileMeansNoTranslation() throws Exception {
            when(service.fetch(ID)).thenReturn(new FetchResult(video(), false));

            postWithProfile("  ").andExpect(status().isOk());

            verify(profiles, never()).read(anyString());
            verify(translation, never()).startFromFetch(anyString(), anyString());
        }

        @Test
        void fetchWithProfileStartsTranslation() throws Exception {
            when(service.fetch(ID)).thenReturn(new FetchResult(video(), true));
            when(translation.startFromFetch(ID, "EmiBonnie")).thenReturn(null);
            Video translating = video();
            setTranslating(translating);
            when(service.get(ID)).thenReturn(translating);

            postWithProfile("EmiBonnie")
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.id").value(ID))
                    .andExpect(jsonPath("$.translationStatus").value("TRANSLATING"))
                    .andExpect(jsonPath("$.skipReason").doesNotExist());
            var order = inOrder(profiles, service, translation);
            order.verify(profiles).read("EmiBonnie");
            order.verify(service).fetch(ID);
            order.verify(translation).startFromFetch(ID, "EmiBonnie");
        }

        @Test
        void fetchWithUnknownProfileIs400BeforeYtDlp() throws Exception {
            when(profiles.read("Nope")).thenThrow(new UnknownProfileException("Nope"));

            expectProblem(postWithProfile("Nope"), 400, "UNKNOWN_PROFILE");
            verify(service, never()).fetch(anyString());
        }

        @Test
        void fetchReportsSkipReason() throws Exception {
            when(service.fetch(ID)).thenReturn(new FetchResult(video(), false));
            when(translation.startFromFetch(ID, "EmiBonnie")).thenReturn(SkipReason.VIETSUB_MANUAL);

            postWithProfile("EmiBonnie")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.skipReason").value("VIETSUB_MANUAL"))
                    .andExpect(jsonPath("$.id").value(ID));
        }

        @Test
        void translateStarts202() throws Exception {
            Video translating = video();
            setTranslating(translating);
            when(service.get(ID)).thenReturn(translating);

            translate("EmiBonnie")
                    .andExpect(status().isAccepted())
                    .andExpect(jsonPath("$.translationStatus").value("TRANSLATING"));
            verify(translation).retranslate(ID, "EmiBonnie");
        }

        @Test
        void translateWithBrokenProfileIs400() throws Exception {
            doThrow(new UnknownProfileException("Big")).when(translation).retranslate(ID, "Big");

            expectProblem(translate("Big"), 400, "UNKNOWN_PROFILE");
        }

        @Test
        void translateManualIs409() throws Exception {
            doThrow(new VietsubManualException(ID)).when(translation).retranslate(ID, "EmiBonnie");

            expectProblem(translate("EmiBonnie"), 409, "VIETSUB_MANUAL");
        }

        @Test
        void translateInProgressIs409() throws Exception {
            doThrow(new TranslationInProgressException(ID)).when(translation).retranslate(ID, "EmiBonnie");

            expectProblem(translate("EmiBonnie"), 409, "TRANSLATION_IN_PROGRESS");
        }

        @Test
        void translateTooLongIs422() throws Exception {
            doThrow(new VideoTooLongException(ID)).when(translation).retranslate(ID, "EmiBonnie");

            expectProblem(translate("EmiBonnie"), 422, "VIDEO_TOO_LONG");
        }

        @Test
        void translateNotConfiguredIs503() throws Exception {
            doThrow(new GeminiNotConfiguredException(ID)).when(translation).retranslate(ID, "EmiBonnie");

            expectProblem(translate("EmiBonnie"), 503, "GEMINI_NOT_CONFIGURED");
        }

        @Test
        void translateUnknownVideoIs404() throws Exception {
            doThrow(new VideoNotFoundException(ID)).when(translation).retranslate(ID, "EmiBonnie");

            expectProblem(translate("EmiBonnie"), 404, "VIDEO_NOT_FOUND");
        }

        /** Video has no public setter for the status; use the same JPQL-free path the service would. */
        private void setTranslating(Video v) {
            org.springframework.test.util.ReflectionTestUtils.setField(v, "translationStatus", TranslationStatus.TRANSLATING);
        }
    }

    @Nested
    class Read {

        @Test
        void listsVideosInServiceOrder() throws Exception {
            Video other = new Video("OTHER000001");
            other.update("Other", null, null, "en", SourceType.MANUAL, 5, Instant.parse("2026-11-01T00:00:00Z"));
            when(service.list()).thenReturn(List.of(video(), other));

            mvc.perform(get("/api/videos"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[0].id").value(ID))
                    .andExpect(jsonPath("$[1].id").value("OTHER000001"))
                    .andExpect(jsonPath("$[1].subSource").value("MANUAL"));
        }

        @Test
        void getsOneVideo() throws Exception {
            when(service.get(ID)).thenReturn(video());

            mvc.perform(get("/api/videos/" + ID))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.subSource").value("AUTO"));
        }

        @Test
        void unknownVideoReturns404() throws Exception {
            when(service.get(ID)).thenThrow(new VideoNotFoundException(ID));

            expectProblem(mvc.perform(get("/api/videos/" + ID)), 404, "VIDEO_NOT_FOUND");
        }

        @Test
        void listsCuesWithIndex() throws Exception {
            when(service.getCues(ID)).thenReturn(List.of(
                    new Cue(1_000, 6_010, "so today we're going to talk"),
                    new Cue(6_010, 8_500, "and why it matters")));

            mvc.perform(get("/api/videos/" + ID + "/cues"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[0].idx").value(0))
                    .andExpect(jsonPath("$[0].startMs").value(1000))
                    .andExpect(jsonPath("$[0].endMs").value(6010))
                    .andExpect(jsonPath("$[0].text").value("so today we're going to talk"))
                    .andExpect(jsonPath("$[1].idx").value(1));
        }

        @Test
        void cuesOfUnknownVideoReturn404() throws Exception {
            when(service.getCues(ID)).thenThrow(new VideoNotFoundException(ID));

            expectProblem(mvc.perform(get("/api/videos/" + ID + "/cues")), 404, "VIDEO_NOT_FOUND");
        }
    }

    @Nested
    class DownloadSrt {

        private final List<Cue> cues = List.of(new Cue(1_000, 2_000, "hello"));

        @Test
        void returnsSrtAsAttachmentWithUtf8FileName() throws Exception {
            when(service.get(ID)).thenReturn(video());
            when(service.getCues(ID)).thenReturn(cues);

            byte[] body = mvc.perform(get("/api/videos/" + ID + "/subtitle.srt"))
                    .andExpect(status().isOk())
                    .andExpect(content().contentTypeCompatibleWith("application/x-subrip"))
                    .andExpect(header().string("Content-Disposition", containsString("attachment")))
                    .andExpect(header().string("Content-Disposition",
                            containsString("filename*=UTF-8''H%E1%BB%8Dc%20Spring%20Boot_dQw4w9WgXcQ.en.srt")))
                    .andReturn().getResponse().getContentAsByteArray();

            assertThat(new String(body, java.nio.charset.StandardCharsets.UTF_8))
                    .isEqualTo(new SrtWriter().write(cues));
        }

        @Test
        void hasNoBomByDefault() throws Exception {
            when(service.get(ID)).thenReturn(video());
            when(service.getCues(ID)).thenReturn(cues);

            byte[] body = mvc.perform(get("/api/videos/" + ID + "/subtitle.srt"))
                    .andReturn().getResponse().getContentAsByteArray();

            assertThat(body[0]).isEqualTo((byte) '1');
        }

        @Test
        void addsBomWhenRequested() throws Exception {
            when(service.get(ID)).thenReturn(video());
            when(service.getCues(ID)).thenReturn(cues);

            byte[] body = mvc.perform(get("/api/videos/" + ID + "/subtitle.srt").param("bom", "true"))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsByteArray();

            assertThat(Arrays.copyOf(body, 3)).containsExactly(0xEF, 0xBB, 0xBF);
        }

        @Test
        void unknownVideoReturns404() throws Exception {
            when(service.get(ID)).thenThrow(new VideoNotFoundException(ID));

            expectProblem(mvc.perform(get("/api/videos/" + ID + "/subtitle.srt")), 404, "VIDEO_NOT_FOUND");
        }
    }

    @Nested
    class Modify {

        @Test
        void refreshEndpointIsGone() throws Exception {
            // Re-fetching from YouTube was removed: the route no longer exists.
            mvc.perform(post("/api/videos/" + ID + "/refresh")).andExpect(status().isNotFound());
        }

        @Test
        void deleteReturns204() throws Exception {
            mvc.perform(delete("/api/videos/" + ID))
                    .andExpect(status().isNoContent());

            verify(service).delete(ID);
        }

        @Test
        void deleteUnknownReturns404() throws Exception {
            doThrow(new VideoNotFoundException(ID)).when(service).delete(ID);

            expectProblem(mvc.perform(delete("/api/videos/" + ID)), 404, "VIDEO_NOT_FOUND");
        }
    }

    private static ResultActions expectProblem(ResultActions result, int status, String code) throws Exception {
        return result
                .andExpect(status().is(status))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(status))
                .andExpect(jsonPath("$.code").value(code))
                .andExpect(jsonPath("$.detail").isNotEmpty());
    }

    private static Video video() {
        Video v = new Video(ID);
        v.update("Học Spring Boot", "Dev Channel", 754, "en-orig", SourceType.AUTO, 2,
                Instant.parse("2026-11-02T10:00:00Z"));
        v.updateVietsub(3, Instant.parse("2026-11-02T11:00:00Z"), ViSource.MANUAL);
        return v;
    }
}
