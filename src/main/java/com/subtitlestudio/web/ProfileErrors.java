package com.subtitlestudio.web;

import com.subtitlestudio.profile.BannerImageNotFoundException;
import com.subtitlestudio.profile.BlockNotFoundException;
import com.subtitlestudio.profile.GroupProfileException;
import com.subtitlestudio.profile.InvalidBlockException;
import com.subtitlestudio.profile.InvalidMediaException;
import com.subtitlestudio.profile.MediaNotFoundException;
import com.subtitlestudio.profile.MediaTooLargeException;
import com.subtitlestudio.profile.ProfileNotFoundException;
import com.subtitlestudio.work.InvalidWorkException;
import com.subtitlestudio.work.PersonInUseException;
import com.subtitlestudio.work.PersonNotFoundException;
import com.subtitlestudio.work.WorkNotFoundException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Errors of group profiles, blocks, media, works and people.
 * Runs before {@link ApiExceptionHandler}, whose catch-all {@code Exception} handler must stay last.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class ProfileErrors {

    @ExceptionHandler(ProfileNotFoundException.class)
    ProblemDetail profileNotFound(ProfileNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "PROFILE_NOT_FOUND", e.getMessage());
    }


    @ExceptionHandler(WorkNotFoundException.class)
    ProblemDetail workNotFound(WorkNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "WORK_NOT_FOUND", e.getMessage());
    }


    @ExceptionHandler(PersonNotFoundException.class)
    ProblemDetail personNotFound(PersonNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "PERSON_NOT_FOUND", e.getMessage());
    }


    /** Same shape as INVALID_BLOCK: {@code errors} lists every rejected field path. */
    @ExceptionHandler(InvalidWorkException.class)
    ProblemDetail invalidWork(InvalidWorkException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_WORK", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }


    @ExceptionHandler(PersonInUseException.class)
    ProblemDetail personInUse(PersonInUseException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.CONFLICT, "PERSON_IN_USE", e.getMessage());
        pd.setProperty("works", e.works());
        return pd;
    }


    @ExceptionHandler(GroupProfileException.class)
    ProblemDetail groupProfile(GroupProfileException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "GROUP_PROFILE", e.getMessage());
    }


    @ExceptionHandler(BlockNotFoundException.class)
    ProblemDetail blockNotFound(BlockNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "BLOCK_NOT_FOUND", e.getMessage());
    }


    @ExceptionHandler(BannerImageNotFoundException.class)
    ProblemDetail bannerImageNotFound(BannerImageNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "BANNER_IMAGE_NOT_FOUND", e.getMessage());
    }


    /** {@code errors} lists every rejected field so the form can mark each input. */
    @ExceptionHandler(InvalidBlockException.class)
    ProblemDetail invalidBlock(InvalidBlockException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_BLOCK", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }


    @ExceptionHandler(InvalidMediaException.class)
    ProblemDetail invalidMedia(InvalidMediaException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_MEDIA", e.getMessage());
    }


    @ExceptionHandler(MediaTooLargeException.class)
    ProblemDetail mediaTooLarge(MediaTooLargeException e) {
        return ProblemDetails.problem(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE", e.getMessage());
    }


    @ExceptionHandler(MediaNotFoundException.class)
    ProblemDetail mediaNotFound(MediaNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "MEDIA_NOT_FOUND", e.getMessage());
    }

}
