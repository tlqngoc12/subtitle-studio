package com.subtitlestudio.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
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
 *
 * <p>The business errors live in one advice per area ({@link VideoErrors}, {@link NovelErrors}, ...).
 * They run first ({@code HIGHEST_PRECEDENCE}); this advice runs last, so its catch-all
 * {@code Exception} handler only sees what no area claimed. Importing this class pulls in all the
 * area advices, so a test that imports it gets the full mapping.
 */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE)
@Import({VideoErrors.class, TranslationErrors.class, ProfileErrors.class, PublishErrors.class,
        PhotoFanficErrors.class, NovelErrors.class, SettingsErrors.class})
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    /** Overrides Spring's default 413 to add the machine-readable code (images and .srt have different limits). */
    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(
            MaxUploadSizeExceededException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        boolean image = request instanceof ServletWebRequest web
                && web.getRequest().getRequestURI().startsWith("/api/media");
        ProblemDetail body = image
                ? ProblemDetails.problem(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE", "Image exceeds 10 MB")
                : ProblemDetails.problem(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "Upload exceeds 5 MB");
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(body);
    }

    /** Last resort: log everything, expose nothing internal. */
    @ExceptionHandler(Exception.class)
    ProblemDetail unexpected(Exception e) {
        log.error("Unexpected error", e);
        return ProblemDetails.problem(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Unexpected server error");
    }
}
