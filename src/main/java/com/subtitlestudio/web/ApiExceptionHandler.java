package com.subtitlestudio.web;

import com.subtitlestudio.profile.InvalidMediaException;
import com.subtitlestudio.profile.MediaNotFoundException;
import com.subtitlestudio.profile.MediaTooLargeException;
import com.subtitlestudio.subtitle.InvalidSrtException;
import com.subtitlestudio.subtitle.NoEnglishSubtitleException;
import com.subtitlestudio.subtitle.VttParseException;
import com.subtitlestudio.url.InvalidUrlException;
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

    @ExceptionHandler(InvalidMediaException.class)
    ProblemDetail invalidMedia(InvalidMediaException e) {
        return problem(HttpStatus.BAD_REQUEST, "INVALID_MEDIA", e.getMessage());
    }

    @ExceptionHandler(MediaTooLargeException.class)
    ProblemDetail mediaTooLarge(MediaTooLargeException e) {
        return problem(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE", e.getMessage());
    }

    @ExceptionHandler(MediaNotFoundException.class)
    ProblemDetail mediaNotFound(MediaNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "MEDIA_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(NoVietsubException.class)
    ProblemDetail noVietsub(NoVietsubException e) {
        return problem(HttpStatus.NOT_FOUND, "NO_VIETSUB", e.getMessage());
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
