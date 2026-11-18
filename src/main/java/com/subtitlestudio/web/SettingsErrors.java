package com.subtitlestudio.web;

import com.subtitlestudio.config.GeminiSettings;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Errors of the Settings screens. Runs before {@link ApiExceptionHandler}, whose catch-all {@code Exception} handler
 * must stay last.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class SettingsErrors {

    /** A rejected setting; {@code field} names the form field the message belongs to. */
    @ExceptionHandler(GeminiSettings.InvalidSettingException.class)
    ProblemDetail invalidSetting(GeminiSettings.InvalidSettingException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_SETTING", e.getMessage());
        pd.setProperty("field", e.field());
        return pd;
    }
}
