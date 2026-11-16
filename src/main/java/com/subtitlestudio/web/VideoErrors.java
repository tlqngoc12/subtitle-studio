package com.subtitlestudio.web;

import com.subtitlestudio.playlist.InvalidPlaylistException;
import com.subtitlestudio.playlist.InvalidPlaylistOrderException;
import com.subtitlestudio.playlist.PlaylistNotFoundException;
import com.subtitlestudio.playlist.VideoHasNoVietsubException;
import com.subtitlestudio.subtitle.InvalidSrtException;
import com.subtitlestudio.subtitle.NoEnglishSubtitleException;
import com.subtitlestudio.subtitle.VttParseException;
import com.subtitlestudio.url.InvalidUrlException;
import com.subtitlestudio.video.FileTooLargeException;
import com.subtitlestudio.video.InvalidVietsubTextException;
import com.subtitlestudio.video.NoVietsubException;
import com.subtitlestudio.video.VideoNotFoundException;
import com.subtitlestudio.video.VietsubChangedException;
import com.subtitlestudio.video.VietsubNotManualException;
import com.subtitlestudio.ytdlp.YtDlpFailedException;
import com.subtitlestudio.ytdlp.YtDlpTimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Errors of videos, subtitles, yt-dlp, vietsub texts and playlists.
 * Runs before {@link ApiExceptionHandler}, whose catch-all {@code Exception} handler must stay last.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class VideoErrors {

    private static final Logger log = LoggerFactory.getLogger(VideoErrors.class);

    @ExceptionHandler(InvalidUrlException.class)
    ProblemDetail invalidUrl(InvalidUrlException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_URL", e.getMessage());
    }


    @ExceptionHandler(NoEnglishSubtitleException.class)
    ProblemDetail noEnglish(NoEnglishSubtitleException e) {
        return ProblemDetails.problem(HttpStatus.UNPROCESSABLE_ENTITY, "NO_ENGLISH_SUBTITLE", e.getMessage());
    }


    /** A .vtt that cannot be parsed is bad yt-dlp output, reported like any other yt-dlp failure. */
    @ExceptionHandler({YtDlpFailedException.class, VttParseException.class})
    ProblemDetail ytDlpFailed(RuntimeException e) {
        log.warn("yt-dlp failed: {}", e.getMessage());
        return ProblemDetails.problem(HttpStatus.BAD_GATEWAY, "YTDLP_FAILED", e.getMessage());
    }


    @ExceptionHandler(YtDlpTimeoutException.class)
    ProblemDetail ytDlpTimeout(YtDlpTimeoutException e) {
        log.warn("yt-dlp timed out: {}", e.getMessage());
        return ProblemDetails.problem(HttpStatus.GATEWAY_TIMEOUT, "YTDLP_TIMEOUT", e.getMessage());
    }


    @ExceptionHandler(InvalidSrtException.class)
    ProblemDetail invalidSrt(InvalidSrtException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_SRT", e.getMessage());
    }


    @ExceptionHandler(FileTooLargeException.class)
    ProblemDetail fileTooLarge(FileTooLargeException e) {
        return ProblemDetails.problem(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", e.getMessage());
    }


    @ExceptionHandler(VietsubNotManualException.class)
    ProblemDetail vietsubNotManual(VietsubNotManualException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "VIETSUB_NOT_MANUAL", e.getMessage());
    }


    @ExceptionHandler(PlaylistNotFoundException.class)
    ProblemDetail playlistNotFound(PlaylistNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "PLAYLIST_NOT_FOUND", e.getMessage());
    }


    /** Same shape as INVALID_BLOCK: {@code errors} lists every rejected field. */
    @ExceptionHandler(InvalidPlaylistException.class)
    ProblemDetail invalidPlaylist(InvalidPlaylistException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_PLAYLIST", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }


    @ExceptionHandler(VideoHasNoVietsubException.class)
    ProblemDetail videoHasNoVietsub(VideoHasNoVietsubException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "VIDEO_HAS_NO_VIETSUB", e.getMessage());
    }


    @ExceptionHandler(InvalidPlaylistOrderException.class)
    ProblemDetail invalidPlaylistOrder(InvalidPlaylistOrderException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_PLAYLIST_ORDER", e.getMessage());
    }


    @ExceptionHandler(NoVietsubException.class)
    ProblemDetail noVietsub(NoVietsubException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "NO_VIETSUB", e.getMessage());
    }


    @ExceptionHandler(VietsubChangedException.class)
    ProblemDetail vietsubChanged(VietsubChangedException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "VIETSUB_CHANGED", e.getMessage());
    }


    /** Same shape as INVALID_BLOCK: {@code errors} lists every rejected field. */
    @ExceptionHandler(InvalidVietsubTextException.class)
    ProblemDetail invalidVietsubText(InvalidVietsubTextException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_VIETSUB_TEXT", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }


    @ExceptionHandler(VideoNotFoundException.class)
    ProblemDetail notFound(VideoNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "VIDEO_NOT_FOUND", e.getMessage());
    }

}
