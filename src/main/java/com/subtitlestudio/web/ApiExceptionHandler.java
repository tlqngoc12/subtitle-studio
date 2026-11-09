package com.subtitlestudio.web;

import com.subtitlestudio.novel.ChapterHasNoPagesException;
import com.subtitlestudio.novel.ChapterNotFoundException;
import com.subtitlestudio.novel.ChapterNotTranslatedException;
import com.subtitlestudio.novel.ChapterPublishedException;
import com.subtitlestudio.novel.ChapterTranslationInProgressException;
import com.subtitlestudio.novel.DuplicateChapterNumberException;
import com.subtitlestudio.novel.DuplicateNovelSlugException;
import com.subtitlestudio.novel.InvalidChapterException;
import com.subtitlestudio.novel.InvalidPageOrderException;
import com.subtitlestudio.novel.PageNotFoundException;
import com.subtitlestudio.novel.InvalidNovelException;
import com.subtitlestudio.novel.NotebookUpdateInProgressException;
import com.subtitlestudio.novel.NovelNotFoundException;
import com.subtitlestudio.playlist.InvalidPlaylistException;
import com.subtitlestudio.playlist.InvalidPlaylistOrderException;
import com.subtitlestudio.playlist.PlaylistNotFoundException;
import com.subtitlestudio.playlist.VideoHasNoVietsubException;
import com.subtitlestudio.profile.BannerImageNotFoundException;
import com.subtitlestudio.profile.BlockNotFoundException;
import com.subtitlestudio.profile.InvalidBlockException;
import com.subtitlestudio.profile.InvalidMediaException;
import com.subtitlestudio.profile.MediaNotFoundException;
import com.subtitlestudio.publish.PublishInProgressException;
import com.subtitlestudio.publish.PublishNotConfiguredException;
import com.subtitlestudio.profile.MediaTooLargeException;
import com.subtitlestudio.profile.ProfileNotFoundException;
import com.subtitlestudio.subtitle.InvalidSrtException;
import com.subtitlestudio.subtitle.NoEnglishSubtitleException;
import com.subtitlestudio.subtitle.VttParseException;
import com.subtitlestudio.url.InvalidUrlException;
import com.subtitlestudio.translate.GeminiNotConfiguredException;
import com.subtitlestudio.translate.TranslationInProgressException;
import com.subtitlestudio.translate.UnknownProfileException;
import com.subtitlestudio.translate.VideoTooLongException;
import com.subtitlestudio.translate.VietsubManualException;
import com.subtitlestudio.video.FileTooLargeException;
import com.subtitlestudio.video.NoVietsubException;
import com.subtitlestudio.video.VideoNotFoundException;
import com.subtitlestudio.ytdlp.YtDlpFailedException;
import com.subtitlestudio.ytdlp.YtDlpTimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Maps exceptions to RFC 9457 {@link ProblemDetail} responses with a machine-readable {@code code}
 * property the frontend uses to pick a message. Spring MVC's own errors (malformed JSON, 405, ...)
 * are handled by the {@link ResponseEntityExceptionHandler} base class.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(InvalidUrlException.class)
    ProblemDetail invalidUrl(InvalidUrlException e) {
        return problem(HttpStatus.BAD_REQUEST, "INVALID_URL", e.getMessage());
    }

    @ExceptionHandler(NoEnglishSubtitleException.class)
    ProblemDetail noEnglish(NoEnglishSubtitleException e) {
        return problem(HttpStatus.UNPROCESSABLE_ENTITY, "NO_ENGLISH_SUBTITLE", e.getMessage());
    }

    /** A .vtt that cannot be parsed is bad yt-dlp output, reported like any other yt-dlp failure. */
    @ExceptionHandler({YtDlpFailedException.class, VttParseException.class})
    ProblemDetail ytDlpFailed(RuntimeException e) {
        log.warn("yt-dlp failed: {}", e.getMessage());
        return problem(HttpStatus.BAD_GATEWAY, "YTDLP_FAILED", e.getMessage());
    }

    @ExceptionHandler(YtDlpTimeoutException.class)
    ProblemDetail ytDlpTimeout(YtDlpTimeoutException e) {
        log.warn("yt-dlp timed out: {}", e.getMessage());
        return problem(HttpStatus.GATEWAY_TIMEOUT, "YTDLP_TIMEOUT", e.getMessage());
    }

    @ExceptionHandler(InvalidSrtException.class)
    ProblemDetail invalidSrt(InvalidSrtException e) {
        return problem(HttpStatus.BAD_REQUEST, "INVALID_SRT", e.getMessage());
    }

    /** Overrides Spring's default 413 to add the machine-readable code (images and .srt have different limits). */
    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(
            MaxUploadSizeExceededException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        boolean image = request instanceof ServletWebRequest web
                && web.getRequest().getRequestURI().startsWith("/api/media");
        ProblemDetail body = image
                ? problem(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE", "Image exceeds 10 MB")
                : problem(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "Upload exceeds 5 MB");
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(body);
    }

    @ExceptionHandler(FileTooLargeException.class)
    ProblemDetail fileTooLarge(FileTooLargeException e) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", e.getMessage());
    }

    @ExceptionHandler(ProfileNotFoundException.class)
    ProblemDetail profileNotFound(ProfileNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "PROFILE_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(BlockNotFoundException.class)
    ProblemDetail blockNotFound(BlockNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "BLOCK_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(BannerImageNotFoundException.class)
    ProblemDetail bannerImageNotFound(BannerImageNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "BANNER_IMAGE_NOT_FOUND", e.getMessage());
    }

    /** {@code errors} lists every rejected field so the form can mark each input. */
    @ExceptionHandler(InvalidBlockException.class)
    ProblemDetail invalidBlock(InvalidBlockException e) {
        ProblemDetail pd = problem(HttpStatus.BAD_REQUEST, "INVALID_BLOCK", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }

    @ExceptionHandler(NovelNotFoundException.class)
    ProblemDetail novelNotFound(NovelNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "NOVEL_NOT_FOUND", e.getMessage());
    }

    /** Same shape as INVALID_BLOCK: {@code errors} lists every rejected field. */
    @ExceptionHandler(InvalidNovelException.class)
    ProblemDetail invalidNovel(InvalidNovelException e) {
        ProblemDetail pd = problem(HttpStatus.BAD_REQUEST, "INVALID_NOVEL", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }

    @ExceptionHandler(DuplicateNovelSlugException.class)
    ProblemDetail duplicateNovelSlug(DuplicateNovelSlugException e) {
        return problem(HttpStatus.CONFLICT, "DUPLICATE_NOVEL_SLUG", e.getMessage());
    }

    @ExceptionHandler(ChapterNotFoundException.class)
    ProblemDetail chapterNotFound(ChapterNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "CHAPTER_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(PageNotFoundException.class)
    ProblemDetail pageNotFound(PageNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "PAGE_NOT_FOUND", e.getMessage());
    }

    /** Same shape as INVALID_BLOCK: {@code errors} lists every rejected field. */
    @ExceptionHandler(InvalidChapterException.class)
    ProblemDetail invalidChapter(InvalidChapterException e) {
        ProblemDetail pd = problem(HttpStatus.BAD_REQUEST, "INVALID_CHAPTER", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }

    @ExceptionHandler(DuplicateChapterNumberException.class)
    ProblemDetail duplicateChapterNumber(DuplicateChapterNumberException e) {
        return problem(HttpStatus.CONFLICT, "DUPLICATE_CHAPTER_NUMBER", e.getMessage());
    }

    @ExceptionHandler(InvalidPageOrderException.class)
    ProblemDetail invalidPageOrder(InvalidPageOrderException e) {
        return problem(HttpStatus.BAD_REQUEST, "INVALID_PAGE_ORDER", e.getMessage());
    }

    /** Same code as a video's running translation: the frontend shows one message for both. */
    @ExceptionHandler(ChapterTranslationInProgressException.class)
    ProblemDetail chapterTranslationInProgress(ChapterTranslationInProgressException e) {
        return problem(HttpStatus.CONFLICT, "TRANSLATION_IN_PROGRESS", e.getMessage());
    }

    @ExceptionHandler(ChapterPublishedException.class)
    ProblemDetail chapterPublished(ChapterPublishedException e) {
        return problem(HttpStatus.CONFLICT, "CHAPTER_PUBLISHED", e.getMessage());
    }

    @ExceptionHandler(ChapterHasNoPagesException.class)
    ProblemDetail chapterHasNoPages(ChapterHasNoPagesException e) {
        return problem(HttpStatus.UNPROCESSABLE_ENTITY, "CHAPTER_HAS_NO_PAGES", e.getMessage());
    }

    @ExceptionHandler(ChapterNotTranslatedException.class)
    ProblemDetail chapterNotTranslated(ChapterNotTranslatedException e) {
        return problem(HttpStatus.CONFLICT, "CHAPTER_NOT_TRANSLATED", e.getMessage());
    }

    @ExceptionHandler(NotebookUpdateInProgressException.class)
    ProblemDetail notebookUpdateInProgress(NotebookUpdateInProgressException e) {
        return problem(HttpStatus.CONFLICT, "NOTEBOOK_UPDATE_IN_PROGRESS", e.getMessage());
    }

    @ExceptionHandler(PlaylistNotFoundException.class)
    ProblemDetail playlistNotFound(PlaylistNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "PLAYLIST_NOT_FOUND", e.getMessage());
    }

    /** Same shape as INVALID_BLOCK: {@code errors} lists every rejected field. */
    @ExceptionHandler(InvalidPlaylistException.class)
    ProblemDetail invalidPlaylist(InvalidPlaylistException e) {
        ProblemDetail pd = problem(HttpStatus.BAD_REQUEST, "INVALID_PLAYLIST", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }

    @ExceptionHandler(VideoHasNoVietsubException.class)
    ProblemDetail videoHasNoVietsub(VideoHasNoVietsubException e) {
        return problem(HttpStatus.CONFLICT, "VIDEO_HAS_NO_VIETSUB", e.getMessage());
    }

    @ExceptionHandler(InvalidPlaylistOrderException.class)
    ProblemDetail invalidPlaylistOrder(InvalidPlaylistOrderException e) {
        return problem(HttpStatus.BAD_REQUEST, "INVALID_PLAYLIST_ORDER", e.getMessage());
    }

    @ExceptionHandler(InvalidMediaException.class)
    ProblemDetail invalidMedia(InvalidMediaException e) {
        return problem(HttpStatus.BAD_REQUEST, "INVALID_MEDIA", e.getMessage());
    }

    @ExceptionHandler(MediaTooLargeException.class)
    ProblemDetail mediaTooLarge(MediaTooLargeException e) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE", e.getMessage());
    }

    @ExceptionHandler(PublishInProgressException.class)
    ProblemDetail publishInProgress(PublishInProgressException e) {
        return problem(HttpStatus.CONFLICT, "PUBLISH_IN_PROGRESS", e.getMessage());
    }

    @ExceptionHandler(PublishNotConfiguredException.class)
    ProblemDetail publishNotConfigured(PublishNotConfiguredException e) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "PUBLISH_NOT_CONFIGURED", e.getMessage());
    }

    @ExceptionHandler(MediaNotFoundException.class)
    ProblemDetail mediaNotFound(MediaNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "MEDIA_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(NoVietsubException.class)
    ProblemDetail noVietsub(NoVietsubException e) {
        return problem(HttpStatus.NOT_FOUND, "NO_VIETSUB", e.getMessage());
    }

    @ExceptionHandler(UnknownProfileException.class)
    ProblemDetail unknownProfile(UnknownProfileException e) {
        return problem(HttpStatus.BAD_REQUEST, "UNKNOWN_PROFILE", e.getMessage());
    }

    @ExceptionHandler(GeminiNotConfiguredException.class)
    ProblemDetail geminiNotConfigured(GeminiNotConfiguredException e) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "GEMINI_NOT_CONFIGURED", e.getMessage());
    }

    @ExceptionHandler(VideoTooLongException.class)
    ProblemDetail videoTooLong(VideoTooLongException e) {
        return problem(HttpStatus.UNPROCESSABLE_ENTITY, "VIDEO_TOO_LONG", e.getMessage());
    }

    @ExceptionHandler(VietsubManualException.class)
    ProblemDetail vietsubManual(VietsubManualException e) {
        return problem(HttpStatus.CONFLICT, "VIETSUB_MANUAL", e.getMessage());
    }

    @ExceptionHandler(TranslationInProgressException.class)
    ProblemDetail translationInProgress(TranslationInProgressException e) {
        return problem(HttpStatus.CONFLICT, "TRANSLATION_IN_PROGRESS", e.getMessage());
    }

    @ExceptionHandler(VideoNotFoundException.class)
    ProblemDetail notFound(VideoNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "VIDEO_NOT_FOUND", e.getMessage());
    }

    /** Last resort: log everything, expose nothing internal. */
    @ExceptionHandler(Exception.class)
    ProblemDetail unexpected(Exception e) {
        log.error("Unexpected error", e);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Unexpected server error");
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setProperty("code", code);
        return pd;
    }
}
