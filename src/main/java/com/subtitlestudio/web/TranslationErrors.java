package com.subtitlestudio.web;

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
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Errors of Gemini translation and the translation profiles/analysis around it.
 * Runs before {@link ApiExceptionHandler}, whose catch-all {@code Exception} handler must stay last.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class TranslationErrors {

    @ExceptionHandler(UnknownProfileException.class)
    ProblemDetail unknownProfile(UnknownProfileException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "UNKNOWN_PROFILE", e.getMessage());
    }


    @ExceptionHandler(NoCorrectionsException.class)
    ProblemDetail noCorrections(NoCorrectionsException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "NO_CORRECTIONS", e.getMessage());
    }


    @ExceptionHandler(AnalysisInvalidException.class)
    ProblemDetail analysisInvalid(AnalysisInvalidException e) {
        return ProblemDetails.problem(HttpStatus.BAD_GATEWAY, "ANALYSIS_INVALID", e.getMessage());
    }


    /** A Gemini call that failed (busy, out of quota, bad key...) during a request that waits for it; the message is for the user. */
    @ExceptionHandler(TranslationFailedException.class)
    ProblemDetail geminiFailed(TranslationFailedException e) {
        return ProblemDetails.problem(HttpStatus.BAD_GATEWAY, "GEMINI_FAILED", e.userMessage());
    }


    @ExceptionHandler(ProfileChangedException.class)
    ProblemDetail profileChanged(ProfileChangedException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "PROFILE_CHANGED", e.getMessage());
    }


    @ExceptionHandler(InvalidProfileTextException.class)
    ProblemDetail invalidProfileText(InvalidProfileTextException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_PROFILE_TEXT", e.getMessage());
    }


    @ExceptionHandler(GeminiNotConfiguredException.class)
    ProblemDetail geminiNotConfigured(GeminiNotConfiguredException e) {
        return ProblemDetails.problem(HttpStatus.SERVICE_UNAVAILABLE, "GEMINI_NOT_CONFIGURED", e.getMessage());
    }


    @ExceptionHandler(VideoTooLongException.class)
    ProblemDetail videoTooLong(VideoTooLongException e) {
        return ProblemDetails.problem(HttpStatus.UNPROCESSABLE_ENTITY, "VIDEO_TOO_LONG", e.getMessage());
    }


    @ExceptionHandler(VietsubManualException.class)
    ProblemDetail vietsubManual(VietsubManualException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "VIETSUB_MANUAL", e.getMessage());
    }


    @ExceptionHandler(TranslationInProgressException.class)
    ProblemDetail translationInProgress(TranslationInProgressException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "TRANSLATION_IN_PROGRESS", e.getMessage());
    }

}
