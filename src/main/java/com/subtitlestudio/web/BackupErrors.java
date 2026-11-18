package com.subtitlestudio.web;

import com.subtitlestudio.backup.BackupRunningException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Errors of the backup API. Runs before {@link ApiExceptionHandler}, whose catch-all {@code Exception} handler must
 * stay last.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class BackupErrors {

    @ExceptionHandler(BackupRunningException.class)
    ProblemDetail running(BackupRunningException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "BACKUP_RUNNING", e.getMessage());
    }
}
