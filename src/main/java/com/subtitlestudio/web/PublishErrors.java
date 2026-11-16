package com.subtitlestudio.web;

import com.subtitlestudio.publish.PublishInProgressException;
import com.subtitlestudio.publish.PublishNotConfiguredException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Errors of publishing the public site.
 * Runs before {@link ApiExceptionHandler}, whose catch-all {@code Exception} handler must stay last.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class PublishErrors {

    @ExceptionHandler(PublishInProgressException.class)
    ProblemDetail publishInProgress(PublishInProgressException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "PUBLISH_IN_PROGRESS", e.getMessage());
    }


    @ExceptionHandler(PublishNotConfiguredException.class)
    ProblemDetail publishNotConfigured(PublishNotConfiguredException e) {
        return ProblemDetails.problem(HttpStatus.SERVICE_UNAVAILABLE, "PUBLISH_NOT_CONFIGURED", e.getMessage());
    }

}
