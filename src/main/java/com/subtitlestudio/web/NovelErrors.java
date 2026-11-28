package com.subtitlestudio.web;

import com.subtitlestudio.novel.BannerFullException;
import com.subtitlestudio.novel.ChapterAlreadyTranslatedException;
import com.subtitlestudio.novel.ChapterHasNoPagesException;
import com.subtitlestudio.novel.ChapterNotFoundException;
import com.subtitlestudio.novel.ChapterNotTranslatedException;
import com.subtitlestudio.novel.ChapterPublishedException;
import com.subtitlestudio.novel.ChapterTextSourceException;
import com.subtitlestudio.novel.ChapterTranslationInProgressException;
import com.subtitlestudio.novel.DuplicateChapterNumberException;
import com.subtitlestudio.novel.DuplicateNovelSlugException;
import com.subtitlestudio.novel.DuplicateWattpadNovelException;
import com.subtitlestudio.novel.InvalidChapterException;
import com.subtitlestudio.novel.InvalidNovelException;
import com.subtitlestudio.novel.InvalidPageOrderException;
import com.subtitlestudio.novel.NovelNotFoundException;
import com.subtitlestudio.novel.NovelNotWattpadException;
import com.subtitlestudio.novel.NovelTranslationBusyException;
import com.subtitlestudio.novel.PageNotFoundException;
import com.subtitlestudio.novel.wattpad.WattpadPartProblemException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Errors of novels, chapters, pages and Wattpad parts.
 * Runs before {@link ApiExceptionHandler}, whose catch-all {@code Exception} handler must stay last.
 */
@RestControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class NovelErrors {

    @ExceptionHandler(NovelNotFoundException.class)
    ProblemDetail novelNotFound(NovelNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "NOVEL_NOT_FOUND", e.getMessage());
    }


    @ExceptionHandler(com.subtitlestudio.novel.NothingToExportException.class)
    ProblemDetail nothingToExport(com.subtitlestudio.novel.NothingToExportException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "NOTHING_TO_EXPORT", "No chapter has text to export yet.");
    }

    @ExceptionHandler(com.subtitlestudio.novel.ChapterReviewNotFoundException.class)
    ProblemDetail reviewNotFound(com.subtitlestudio.novel.ChapterReviewNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "REVIEW_NOT_FOUND", e.getMessage());
    }

    @ExceptionHandler(com.subtitlestudio.novel.NoNovelProfileException.class)
    ProblemDetail noNovelProfile(com.subtitlestudio.novel.NoNovelProfileException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "NO_PROFILE", "This novel has no translation profile.");
    }


    /** Same shape as INVALID_BLOCK: {@code errors} lists every rejected field. */
    @ExceptionHandler(InvalidNovelException.class)
    ProblemDetail invalidNovel(InvalidNovelException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_NOVEL", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }


    @ExceptionHandler(com.subtitlestudio.novel.ChapterImageMarkersException.class)
    ProblemDetail chapterImageMarkers(com.subtitlestudio.novel.ChapterImageMarkersException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "CHAPTER_IMAGE_MARKERS", e.getMessage());
    }


    @ExceptionHandler(BannerFullException.class)
    ProblemDetail bannerFull(BannerFullException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "BANNER_FULL", e.getMessage());
    }


    @ExceptionHandler(DuplicateNovelSlugException.class)
    ProblemDetail duplicateNovelSlug(DuplicateNovelSlugException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "DUPLICATE_NOVEL_SLUG", e.getMessage());
    }


    @ExceptionHandler(DuplicateWattpadNovelException.class)
    ProblemDetail duplicateWattpadNovel(DuplicateWattpadNovelException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.CONFLICT, "NOVEL_WATTPAD_EXISTS", e.getMessage());
        pd.setProperty("novelId", e.novelId());
        return pd;
    }


    @ExceptionHandler(ChapterNotFoundException.class)
    ProblemDetail chapterNotFound(ChapterNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "CHAPTER_NOT_FOUND", e.getMessage());
    }


    @ExceptionHandler(PageNotFoundException.class)
    ProblemDetail pageNotFound(PageNotFoundException e) {
        return ProblemDetails.problem(HttpStatus.NOT_FOUND, "PAGE_NOT_FOUND", e.getMessage());
    }


    /** Same shape as INVALID_BLOCK: {@code errors} lists every rejected field. */
    @ExceptionHandler(InvalidChapterException.class)
    ProblemDetail invalidChapter(InvalidChapterException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_CHAPTER", e.getMessage());
        pd.setProperty("errors", e.errors());
        return pd;
    }


    @ExceptionHandler(DuplicateChapterNumberException.class)
    ProblemDetail duplicateChapterNumber(DuplicateChapterNumberException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "DUPLICATE_CHAPTER_NUMBER", e.getMessage());
    }


    @ExceptionHandler(InvalidPageOrderException.class)
    ProblemDetail invalidPageOrder(InvalidPageOrderException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, "INVALID_PAGE_ORDER", e.getMessage());
    }


    /** Same code as a video's running translation: the frontend shows one message for both. */
    @ExceptionHandler(ChapterTranslationInProgressException.class)
    ProblemDetail chapterTranslationInProgress(ChapterTranslationInProgressException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "TRANSLATION_IN_PROGRESS", e.getMessage());
    }


    @ExceptionHandler(ChapterPublishedException.class)
    ProblemDetail chapterPublished(ChapterPublishedException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "CHAPTER_PUBLISHED", e.getMessage());
    }


    @ExceptionHandler(ChapterTextSourceException.class)
    ProblemDetail chapterTextSource(ChapterTextSourceException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "CHAPTER_TEXT_SOURCE", e.getMessage());
    }


    @ExceptionHandler(NovelTranslationBusyException.class)
    ProblemDetail novelTranslationBusy(NovelTranslationBusyException e) {
        ProblemDetail pd = ProblemDetails.problem(HttpStatus.CONFLICT, "NOVEL_TRANSLATION_BUSY", e.getMessage());
        pd.setProperty("reason", e.reason().name());
        pd.setProperty("chapterNo", e.chapterNo());
        pd.setProperty("chapterTitle", e.chapterTitle());
        return pd;
    }


    @ExceptionHandler(ChapterAlreadyTranslatedException.class)
    ProblemDetail chapterAlreadyTranslated(ChapterAlreadyTranslatedException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "CHAPTER_ALREADY_TRANSLATED", e.getMessage());
    }


    @ExceptionHandler(WattpadPartProblemException.class)
    ProblemDetail wattpadPartProblem(WattpadPartProblemException e) {
        HttpStatus status = WattpadPartProblemException.NOT_FOUND.equals(e.code()) ? HttpStatus.NOT_FOUND
                : HttpStatus.CONFLICT;
        return ProblemDetails.problem(status, e.code(), e.getMessage());
    }


    @ExceptionHandler(com.subtitlestudio.novel.wattpad.WattpadSyncRunningException.class)
    ProblemDetail wattpadSyncRunning(com.subtitlestudio.novel.wattpad.WattpadSyncRunningException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, com.subtitlestudio.novel.wattpad.WattpadSyncRunningException.CODE,
                e.getMessage());
    }


    @ExceptionHandler(com.subtitlestudio.novel.wattpad.WattpadNothingNextException.class)
    ProblemDetail wattpadNothingNext(com.subtitlestudio.novel.wattpad.WattpadNothingNextException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, com.subtitlestudio.novel.wattpad.WattpadNothingNextException.CODE,
                e.getMessage());
    }


    @ExceptionHandler(com.subtitlestudio.novel.NovelNotTranslatableException.class)
    ProblemDetail novelNotTranslatable(com.subtitlestudio.novel.NovelNotTranslatableException e) {
        return ProblemDetails.problem(HttpStatus.BAD_REQUEST, com.subtitlestudio.novel.NovelNotTranslatableException.CODE,
                e.getMessage());
    }


    @ExceptionHandler(NovelNotWattpadException.class)
    ProblemDetail novelNotWattpad(NovelNotWattpadException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "NOVEL_NOT_WATTPAD", e.getMessage());
    }


    @ExceptionHandler(ChapterHasNoPagesException.class)
    ProblemDetail chapterHasNoPages(ChapterHasNoPagesException e) {
        return ProblemDetails.problem(HttpStatus.UNPROCESSABLE_ENTITY, "CHAPTER_HAS_NO_PAGES", e.getMessage());
    }


    @ExceptionHandler(ChapterNotTranslatedException.class)
    ProblemDetail chapterNotTranslated(ChapterNotTranslatedException e) {
        return ProblemDetails.problem(HttpStatus.CONFLICT, "CHAPTER_NOT_TRANSLATED", e.getMessage());
    }

}
