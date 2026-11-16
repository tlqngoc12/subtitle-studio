package com.subtitlestudio.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.subtitlestudio.fanfic.FanficExistsException;
import com.subtitlestudio.fanfic.FanficNotFoundException;
import com.subtitlestudio.fanfic.InvalidFanficLinkException;
import com.subtitlestudio.fanfic.WattpadUnavailableException;
import com.subtitlestudio.novel.BannerFullException;
import com.subtitlestudio.novel.ChapterAlreadyTranslatedException;
import com.subtitlestudio.novel.ChapterHasNoPagesException;
import com.subtitlestudio.novel.ChapterNotFoundException;
import com.subtitlestudio.novel.ChapterNotTranslatedException;
import com.subtitlestudio.novel.ChapterPublishedException;
import com.subtitlestudio.novel.ChapterTextSourceException;
import com.subtitlestudio.novel.ChapterTranslationInProgressException;
import com.subtitlestudio.novel.DuplicateChapterNumberException;
import com.subtitlestudio.novel.DuplicateNovelSlugException;
import com.subtitlestudio.novel.DuplicateWattpadNovelException;
import com.subtitlestudio.novel.InvalidChapterException;
import com.subtitlestudio.novel.InvalidNovelException;
import com.subtitlestudio.novel.InvalidPageOrderException;
import com.subtitlestudio.novel.NoNovelProfileException;
import com.subtitlestudio.novel.NovelNotFoundException;
import com.subtitlestudio.novel.NovelNotWattpadException;
import com.subtitlestudio.novel.NovelTranslationBusyException;
import com.subtitlestudio.novel.PageNotFoundException;
import com.subtitlestudio.novel.wattpad.WattpadNothingNextException;
import com.subtitlestudio.novel.wattpad.WattpadPartProblemException;
import com.subtitlestudio.photo.PhotoPostExistsException;
import com.subtitlestudio.photo.PhotoPostNotFoundException;
import com.subtitlestudio.photo.XPostHasNoImageException;
import com.subtitlestudio.photo.XPostNotFoundException;
import com.subtitlestudio.photo.XUnavailableException;
import com.subtitlestudio.playlist.InvalidPlaylistException;
import com.subtitlestudio.playlist.InvalidPlaylistOrderException;
import com.subtitlestudio.playlist.PlaylistNotFoundException;
import com.subtitlestudio.playlist.VideoHasNoVietsubException;
import com.subtitlestudio.profile.BannerImageNotFoundException;
import com.subtitlestudio.profile.BlockNotFoundException;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.GroupProfileException;
import com.subtitlestudio.profile.InvalidBlockException;
import com.subtitlestudio.profile.InvalidMediaException;
import com.subtitlestudio.profile.MediaNotFoundException;
import com.subtitlestudio.profile.MediaTooLargeException;
import com.subtitlestudio.profile.ProfileNotFoundException;
import com.subtitlestudio.publish.PublishInProgressException;
import com.subtitlestudio.publish.PublishNotConfiguredException;
import com.subtitlestudio.subtitle.InvalidSrtException;
import com.subtitlestudio.subtitle.NoEnglishSubtitleException;
import com.subtitlestudio.subtitle.VttParseException;
import com.subtitlestudio.translate.AnalysisInvalidException;
import com.subtitlestudio.translate.GeminiNotConfiguredException;
import com.subtitlestudio.translate.InvalidProfileTextException;
import com.subtitlestudio.translate.NoCorrectionsException;
import com.subtitlestudio.translate.ProfileChangedException;
import com.subtitlestudio.translate.TranslationFailedException;
import com.subtitlestudio.translate.TranslationInProgressException;
import com.subtitlestudio.translate.UnknownProfileException;
import com.subtitlestudio.translate.VideoTooLongException;
import com.subtitlestudio.translate.VietsubManualException;
import com.subtitlestudio.url.InvalidUrlException;
import com.subtitlestudio.video.FileTooLargeException;
import com.subtitlestudio.video.InvalidVietsubTextException;
import com.subtitlestudio.video.NoVietsubException;
import com.subtitlestudio.video.VideoNotFoundException;
import com.subtitlestudio.video.VietsubChangedException;
import com.subtitlestudio.video.VietsubNotManualException;
import com.subtitlestudio.work.InvalidWorkException;
import com.subtitlestudio.work.PersonInUseException;
import com.subtitlestudio.work.PersonNotFoundException;
import com.subtitlestudio.work.WorkNotFoundException;
import com.subtitlestudio.ytdlp.YtDlpFailedException;
import com.subtitlestudio.ytdlp.YtDlpTimeoutException;
import java.util.List;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * Pins every exception to its HTTP status and {@code code}. Guards the split of the error handlers
 * by area: moving a handler between advice classes must not change what a client sees.
 */
@WebMvcTest(ApiErrorMappingTest.ThrowingController.class)
@Import({ApiExceptionHandler.class, ApiErrorMappingTest.ThrowingController.class})
class ApiErrorMappingTest {

    private static final List<FieldError> FIELDS = List.of(new FieldError("name", "required"));

    record Case(Supplier<? extends RuntimeException> thrown, HttpStatus status, String code) {
    }

    private static Case c(Supplier<? extends RuntimeException> thrown, HttpStatus status, String code) {
        return new Case(thrown, status, code);
    }

    static final List<Case> CASES = List.of(
            c(() -> new InvalidUrlException("x"), HttpStatus.BAD_REQUEST, "INVALID_URL"),
            c(() -> new NoEnglishSubtitleException("v"), HttpStatus.UNPROCESSABLE_ENTITY, "NO_ENGLISH_SUBTITLE"),
            c(() -> new YtDlpFailedException("boom"), HttpStatus.BAD_GATEWAY, "YTDLP_FAILED"),
            c(() -> new VttParseException("bad vtt"), HttpStatus.BAD_GATEWAY, "YTDLP_FAILED"),
            c(() -> new YtDlpTimeoutException("slow"), HttpStatus.GATEWAY_TIMEOUT, "YTDLP_TIMEOUT"),
            c(() -> new InvalidSrtException("bad"), HttpStatus.BAD_REQUEST, "INVALID_SRT"),
            c(FileTooLargeException::new, HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE"),
            c(() -> new ProfileNotFoundException("s"), HttpStatus.NOT_FOUND, "PROFILE_NOT_FOUND"),
            c(() -> new PhotoPostNotFoundException(1), HttpStatus.NOT_FOUND, "PHOTO_POST_NOT_FOUND"),
            c(() -> new PhotoPostExistsException("t"), HttpStatus.CONFLICT, "PHOTO_POST_EXISTS"),
            c(XPostNotFoundException::new, HttpStatus.NOT_FOUND, "X_POST_NOT_FOUND"),
            c(XPostHasNoImageException::new, HttpStatus.UNPROCESSABLE_ENTITY, "X_POST_NO_IMAGE"),
            c(() -> new XUnavailableException("down"), HttpStatus.BAD_GATEWAY, "X_UNAVAILABLE"),
            c(() -> new InvalidFanficLinkException("l"), HttpStatus.BAD_REQUEST, "INVALID_FANFIC_LINK"),
            c(() -> new FanficNotFoundException(1), HttpStatus.NOT_FOUND, "FANFIC_NOT_FOUND"),
            c(() -> new FanficExistsException("t"), HttpStatus.CONFLICT, "FANFIC_EXISTS"),
            c(() -> new WattpadUnavailableException("down"), HttpStatus.BAD_GATEWAY, "WATTPAD_UNAVAILABLE"),
            c(() -> new WorkNotFoundException(1), HttpStatus.NOT_FOUND, "WORK_NOT_FOUND"),
            c(() -> new PersonNotFoundException(1), HttpStatus.NOT_FOUND, "PERSON_NOT_FOUND"),
            c(() -> new InvalidWorkException(FIELDS), HttpStatus.BAD_REQUEST, "INVALID_WORK"),
            c(() -> new PersonInUseException(List.of("w")), HttpStatus.CONFLICT, "PERSON_IN_USE"),
            c(GroupProfileException::new, HttpStatus.CONFLICT, "GROUP_PROFILE"),
            c(() -> new BlockNotFoundException(1), HttpStatus.NOT_FOUND, "BLOCK_NOT_FOUND"),
            c(() -> new BannerImageNotFoundException(1), HttpStatus.NOT_FOUND, "BANNER_IMAGE_NOT_FOUND"),
            c(() -> new InvalidBlockException(FIELDS), HttpStatus.BAD_REQUEST, "INVALID_BLOCK"),
            c(() -> new NovelNotFoundException(1), HttpStatus.NOT_FOUND, "NOVEL_NOT_FOUND"),
            c(() -> new NoNovelProfileException(1), HttpStatus.NOT_FOUND, "NO_PROFILE"),
            c(() -> new VietsubNotManualException("v"), HttpStatus.CONFLICT, "VIETSUB_NOT_MANUAL"),
            c(() -> new InvalidNovelException(FIELDS), HttpStatus.BAD_REQUEST, "INVALID_NOVEL"),
            c(BannerFullException::new, HttpStatus.CONFLICT, "BANNER_FULL"),
            c(() -> new DuplicateNovelSlugException("s"), HttpStatus.CONFLICT, "DUPLICATE_NOVEL_SLUG"),
            c(() -> new DuplicateWattpadNovelException("t", 1), HttpStatus.CONFLICT, "NOVEL_WATTPAD_EXISTS"),
            c(() -> new ChapterNotFoundException(1), HttpStatus.NOT_FOUND, "CHAPTER_NOT_FOUND"),
            c(() -> new PageNotFoundException(1), HttpStatus.NOT_FOUND, "PAGE_NOT_FOUND"),
            c(() -> new InvalidChapterException(FIELDS), HttpStatus.BAD_REQUEST, "INVALID_CHAPTER"),
            c(() -> new DuplicateChapterNumberException(1), HttpStatus.CONFLICT, "DUPLICATE_CHAPTER_NUMBER"),
            c(InvalidPageOrderException::new, HttpStatus.BAD_REQUEST, "INVALID_PAGE_ORDER"),
            c(() -> new ChapterTranslationInProgressException(1), HttpStatus.CONFLICT, "TRANSLATION_IN_PROGRESS"),
            c(() -> new ChapterPublishedException(1), HttpStatus.CONFLICT, "CHAPTER_PUBLISHED"),
            c(() -> new ChapterTextSourceException(1), HttpStatus.CONFLICT, "CHAPTER_TEXT_SOURCE"),
            c(com.subtitlestudio.novel.ChapterImageMarkersException::new, HttpStatus.BAD_REQUEST,
                    "CHAPTER_IMAGE_MARKERS"),
            c(() -> new NovelTranslationBusyException(1, NovelTranslationBusyException.Reason.CHAPTER_TRANSLATING, 2),
                    HttpStatus.CONFLICT, "NOVEL_TRANSLATION_BUSY"),
            c(() -> new ChapterAlreadyTranslatedException(1), HttpStatus.CONFLICT, "CHAPTER_ALREADY_TRANSLATED"),
            c(() -> new WattpadPartProblemException(WattpadPartProblemException.NOT_FOUND, "m"),
                    HttpStatus.NOT_FOUND, "WATTPAD_PART_NOT_FOUND"),
            c(() -> new WattpadPartProblemException(WattpadPartProblemException.DELETED, "m"),
                    HttpStatus.CONFLICT, "WATTPAD_PART_DELETED"),
            c(() -> new WattpadPartProblemException(WattpadPartProblemException.EMPTY, "m"),
                    HttpStatus.CONFLICT, "WATTPAD_PART_EMPTY"),
            c(() -> new WattpadPartProblemException(WattpadPartProblemException.IMAGES_FAILED, "m"),
                    HttpStatus.CONFLICT, "WATTPAD_PART_IMAGES_FAILED"),
            c(WattpadNothingNextException::new, HttpStatus.CONFLICT, "WATTPAD_NOTHING_NEXT"),
            c(() -> new NovelNotWattpadException(1), HttpStatus.CONFLICT, "NOVEL_NOT_WATTPAD"),
            c(() -> new ChapterHasNoPagesException(1), HttpStatus.UNPROCESSABLE_ENTITY, "CHAPTER_HAS_NO_PAGES"),
            c(() -> new ChapterNotTranslatedException(1), HttpStatus.CONFLICT, "CHAPTER_NOT_TRANSLATED"),
            c(() -> new PlaylistNotFoundException(1), HttpStatus.NOT_FOUND, "PLAYLIST_NOT_FOUND"),
            c(() -> new InvalidPlaylistException(FIELDS), HttpStatus.BAD_REQUEST, "INVALID_PLAYLIST"),
            c(() -> new VideoHasNoVietsubException("v"), HttpStatus.CONFLICT, "VIDEO_HAS_NO_VIETSUB"),
            c(InvalidPlaylistOrderException::new, HttpStatus.BAD_REQUEST, "INVALID_PLAYLIST_ORDER"),
            c(() -> new InvalidMediaException("m"), HttpStatus.BAD_REQUEST, "INVALID_MEDIA"),
            c(MediaTooLargeException::new, HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE"),
            c(PublishInProgressException::new, HttpStatus.CONFLICT, "PUBLISH_IN_PROGRESS"),
            c(PublishNotConfiguredException::new, HttpStatus.SERVICE_UNAVAILABLE, "PUBLISH_NOT_CONFIGURED"),
            c(() -> new MediaNotFoundException(1), HttpStatus.NOT_FOUND, "MEDIA_NOT_FOUND"),
            c(() -> new NoVietsubException("v"), HttpStatus.NOT_FOUND, "NO_VIETSUB"),
            c(() -> new VietsubChangedException("v"), HttpStatus.CONFLICT, "VIETSUB_CHANGED"),
            c(() -> new InvalidVietsubTextException(FIELDS), HttpStatus.BAD_REQUEST, "INVALID_VIETSUB_TEXT"),
            c(() -> new UnknownProfileException("n"), HttpStatus.BAD_REQUEST, "UNKNOWN_PROFILE"),
            c(() -> new NoCorrectionsException("m"), HttpStatus.BAD_REQUEST, "NO_CORRECTIONS"),
            c(() -> new AnalysisInvalidException("m"), HttpStatus.BAD_GATEWAY, "ANALYSIS_INVALID"),
            c(() -> new TranslationFailedException("m"), HttpStatus.BAD_GATEWAY, "GEMINI_FAILED"),
            c(() -> new ProfileChangedException("m"), HttpStatus.CONFLICT, "PROFILE_CHANGED"),
            c(() -> new InvalidProfileTextException("m"), HttpStatus.BAD_REQUEST, "INVALID_PROFILE_TEXT"),
            c(() -> new GeminiNotConfiguredException("v"), HttpStatus.SERVICE_UNAVAILABLE, "GEMINI_NOT_CONFIGURED"),
            c(() -> new VideoTooLongException("v"), HttpStatus.UNPROCESSABLE_ENTITY, "VIDEO_TOO_LONG"),
            c(() -> new VietsubManualException("v"), HttpStatus.CONFLICT, "VIETSUB_MANUAL"),
            c(() -> new TranslationInProgressException("v"), HttpStatus.CONFLICT, "TRANSLATION_IN_PROGRESS"),
            c(() -> new VideoNotFoundException("v"), HttpStatus.NOT_FOUND, "VIDEO_NOT_FOUND"),
            c(() -> new IllegalStateException("secret"), HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR"));

    @RestController
    static class ThrowingController {
        @GetMapping("/api/test-errors/{index}")
        String throwIt(@PathVariable int index) {
            throw CASES.get(index).thrown().get();
        }

        @GetMapping("/api/test-errors/ok")
        String ok() {
            return "ok";
        }

        @GetMapping("/api/media/test-too-large")
        String mediaTooLarge() {
            throw new MaxUploadSizeExceededException(10);
        }

        @GetMapping("/api/other/test-too-large")
        String otherTooLarge() {
            throw new MaxUploadSizeExceededException(5);
        }
    }

    @Autowired
    private MockMvc mvc;

    static Stream<Arguments> cases() {
        return Stream.iterate(0, i -> i + 1).limit(CASES.size()).map(i -> {
            Case c = CASES.get(i);
            return Arguments.of(i, c.thrown().get().getClass().getSimpleName() + " -> " + c.code(), c.status(), c.code());
        });
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("cases")
    void mapsToStatusAndCode(int index, String label, HttpStatus status, String code) throws Exception {
        mvc.perform(get("/api/test-errors/" + index))
                .andExpect(status().is(status.value()))
                .andExpect(jsonPath("$.code").value(code));
    }

    @Test
    void carriesExtraProperties() throws Exception {
        mvc.perform(get("/api/test-errors/" + indexOf(PersonInUseException.class)))
                .andExpect(jsonPath("$.works[0]").value("w"));
        mvc.perform(get("/api/test-errors/" + indexOf(InvalidNovelException.class)))
                .andExpect(jsonPath("$.errors[0].field").value("name"));
        mvc.perform(get("/api/test-errors/" + indexOf(DuplicateWattpadNovelException.class)))
                .andExpect(jsonPath("$.novelId").value(1));
        mvc.perform(get("/api/test-errors/" + indexOf(NovelTranslationBusyException.class)))
                .andExpect(jsonPath("$.reason").value("CHAPTER_TRANSLATING"))
                .andExpect(jsonPath("$.chapterNo").value(2));
        mvc.perform(get("/api/test-errors/" + indexOf(PhotoPostExistsException.class)))
                .andExpect(jsonPath("$.title").value("t"));
    }

    @Test
    void springMvcErrorsKeepTheirStatus() throws Exception {
        mvc.perform(post("/api/test-errors/ok")).andExpect(status().isMethodNotAllowed());
    }

    @Test
    void oversizedUploadGets413WithCodePerArea() throws Exception {
        mvc.perform(get("/api/media/test-too-large")).andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("MEDIA_TOO_LARGE"));
        mvc.perform(get("/api/other/test-too-large")).andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.code").value("FILE_TOO_LARGE"));
    }

    @Test
    void unexpectedErrorHidesTheDetail() throws Exception {
        mvc.perform(get("/api/test-errors/" + (CASES.size() - 1)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.detail").value("Unexpected server error"));
    }

    private static int indexOf(Class<? extends RuntimeException> type) {
        for (int i = 0; i < CASES.size(); i++) {
            if (type.isInstance(CASES.get(i).thrown().get())) {
                return i;
            }
        }
        throw new IllegalArgumentException(type.getName());
    }
}
