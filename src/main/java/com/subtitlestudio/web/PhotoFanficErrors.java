package com.subtitlestudio.web;

import com.subtitlestudio.fanfic.FanficExistsException;
import com.subtitlestudio.fanfic.FanficNotFoundException;
import com.subtitlestudio.fanfic.InvalidFanficLinkException;
import com.subtitlestudio.fanfic.WattpadUnavailableException;
import com.subtitlestudio.photo.PhotoPostExistsException;
import com.subtitlestudio.photo.PhotoPostNotFoundException;
import com.subtitlestudio.photo.XPostHasNoImageException;
import com.subtitlestudio.photo.XPostNotFoundException;
import com.subtitlestudio.photo.XUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Errors of photo posts (X) and fanfics (Wattpad).
 * Runs before {@link ApiExceptionHandler}, whose catch-all {@code Exception} handler must stay last.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class PhotoFanficErrors {

    private static final Logger log = LoggerFactory.getLogger(PhotoFanficErrors.class);

    @ExceptionHandler(PhotoPostNotFoundException.class)
    ProblemDetail photoPostNotFound(PhotoPostNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "PHOTO_POST_NOT_FOUND", e.getMessage());
    }


    @ExceptionHandler(PhotoPostExistsException.class)
    ProblemDetail photoPostExists(PhotoPostExistsException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.CONFLICT, "PHOTO_POST_EXISTS", e.getMessage());
        pd.setProperty("title", e.title());
        return pd;
    }


    @ExceptionHandler(XPostNotFoundException.class)
    ProblemDetail xPostNotFound(XPostNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "X_POST_NOT_FOUND", e.getMessage());
    }


    @ExceptionHandler(XPostHasNoImageException.class)
    ProblemDetail xPostHasNoImage(XPostHasNoImageException e) {
        return ProblemDetails.problem(HttpStatus.UNPROCESSABLE_ENTITY, "X_POST_NO_IMAGE", e.getMessage());
    }


    @ExceptionHandler(XUnavailableException.class)
    ProblemDetail xUnavailable(XUnavailableException e) {
        log.warn("X unavailable: {}", e.getMessage());
        return ProblemDetails.problem(HttpStatus.BAD_GATEWAY, "X_UNAVAILABLE", "X didn't answer, try again or upload the image yourself");
    }


    @ExceptionHandler(InvalidFanficLinkException.class)
    ProblemDetail invalidFanficLink(InvalidFanficLinkException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_FANFIC_LINK", e.getMessage());
    }


    @ExceptionHandler(FanficNotFoundException.class)
    ProblemDetail fanficNotFound(FanficNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "FANFIC_NOT_FOUND", e.getMessage());
    }


    @ExceptionHandler(FanficExistsException.class)
    ProblemDetail fanficExists(FanficExistsException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.CONFLICT, "FANFIC_EXISTS", e.getMessage());
        pd.setProperty("title", e.title());
        return pd;
    }


    @ExceptionHandler(WattpadUnavailableException.class)
    ProblemDetail wattpadUnavailable(WattpadUnavailableException e) {
        log.warn("Wattpad unavailable: {}", e.getMessage());
        return ProblemDetails.problem(HttpStatus.BAD_GATEWAY, "WATTPAD_UNAVAILABLE", "Wattpad did not answer. Try again later.");
    }

}
