package com.subtitlestudio.novel;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.translate.GeminiNotConfiguredException;
import com.subtitlestudio.translate.PromptProfileStore;
import com.subtitlestudio.translate.TranslationFailedException;
import com.subtitlestudio.translate.UnknownProfileException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Translates a chapter in the background (spec section 4): pages go to Gemini in batches with the profile, the story
 * notebook and the previous chapter; the text is saved only when every batch succeeded. Also publish / unpublish.
 */
@Service
public class ChapterTranslationService {

    static final String INTERRUPTED = "Translation was interrupted.";
    static final int PREVIOUS_TEXT_CHARS = 20_000;
    static final int CARRY_OVER_CHARS = 2_000;
    private static final int MAX_ERROR_LENGTH = 500;
    private static final Logger log = LoggerFactory.getLogger(ChapterTranslationService.class);

    /** What the background run needs, read in one transaction. */
    private record Job(long novelId, int chapterNo, String novelTitle, String profile, String notebookText,
                       String previousText, List<Long> mediaIds) {}

    private final SubtitleStudioProperties.Gemini gemini;
    private final int pagesPerRequest;
    private final PromptProfileStore profiles;
    private final ChapterTranslator translator;
    private final PageImagePreparer preparer;
    private final MediaService media;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final NotebookPromptSource notebook;
    private final NotebookScheduler scheduler;
    private final ChapterService chapterService;
    private final TransactionTemplate tx;
    private final Executor executor;
    private final Clock clock;

    public ChapterTranslationService(SubtitleStudioProperties properties, PromptProfileStore profiles,
                                     ChapterTranslator translator, PageImagePreparer preparer, MediaService media,
                                     ChapterRepository chapters, ChapterPageRepository pages,
                                     NotebookPromptSource notebook, NotebookScheduler scheduler,
                                     ChapterService chapterService, TransactionTemplate tx,
                                     @Qualifier("translationExecutor") Executor executor, Clock clock) {
        this.gemini = properties.gemini();
        this.pagesPerRequest = properties.novel().pagesPerRequest();
        this.profiles = profiles;
        this.translator = translator;
        this.preparer = preparer;
        this.media = media;
        this.chapters = chapters;
        this.pages = pages;
        this.notebook = notebook;
        this.scheduler = scheduler;
        this.chapterService = chapterService;
        this.tx = tx;
        this.executor = executor;
        this.clock = clock;
    }

    /** Checks, marks the chapter TRANSLATING (committed), then translates in the background. */
    public ChapterDetail start(long chapterId) {
        ChapterDetail started = tx.execute(status -> {
            Chapter c = chapterService.find(chapterId);
            if (!gemini.configured()) {
                throw new GeminiNotConfiguredException("chapter " + chapterId);
            }
            String profile = c.getNovel().getPromptProfile();
            if (profile == null) {
                throw new UnknownProfileException("(none)");
            }
            profiles.read(profile);
            if (pages.countByChapterId(chapterId) == 0) {
                throw new ChapterHasNoPagesException(chapterId);
            }
            if (c.getTranslationStatus() == ChapterTranslationStatus.TRANSLATING) {
                throw new ChapterTranslationInProgressException(chapterId);
            }
            c.setTranslationStatus(ChapterTranslationStatus.TRANSLATING);
            c.setTranslationError(null);
            chapters.flush();
            return chapterService.detail(c);
        });
        executor.execute(() -> run(chapterId));
        return started;
    }

    public ChapterDetail publish(long chapterId) {
        return tx.execute(status -> {
            Chapter c = chapterService.find(chapterId);
            if (c.getTranslationStatus() == ChapterTranslationStatus.TRANSLATING) {
                throw new ChapterTranslationInProgressException(chapterId);
            }
            List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(chapterId);
            if (ps.isEmpty() || ps.stream().anyMatch(p -> p.getTextVi() == null || p.getTextVi().isBlank())) {
                throw new ChapterNotTranslatedException(chapterId);
            }
            if (c.getPublishStatus() != ChapterPublishStatus.PUBLISHED) {
                c.setPublishStatus(ChapterPublishStatus.PUBLISHED);
                c.setPublishedAt(clock.instant());
                c.touch(clock.instant());
                c.getNovel().touch(clock.instant());
                chapters.flush();
                scheduler.scheduleUpdate(c.getNovel().getId(), c.getChapterNo());
            }
            return chapterService.detail(c);
        });
    }

    public ChapterDetail unpublish(long chapterId) {
        return tx.execute(status -> {
            Chapter c = chapterService.find(chapterId);
            c.setPublishStatus(ChapterPublishStatus.DRAFT);
            c.touch(clock.instant());
            c.getNovel().touch(clock.instant());
            chapters.flush();
            return chapterService.detail(c);
        });
    }

    /** At startup nothing can still be running: earlier runs died with the previous process. */
    @EventListener(ApplicationReadyEvent.class)
    public void markInterrupted() {
        tx.executeWithoutResult(status -> chapters.findByTranslationStatus(ChapterTranslationStatus.TRANSLATING)
                .forEach(c -> {
                    c.setTranslationStatus(ChapterTranslationStatus.FAILED);
                    c.setTranslationError(INTERRUPTED);
                }));
    }

    private void run(long chapterId) {
        try {
            Job job = tx.execute(status -> load(chapterId));
            if (job == null) {
                return;
            }
            List<PageImage> images = new ArrayList<>();
            for (int i = 0; i < job.mediaIds().size(); i++) {
                images.add(new PageImage(i + 1, preparer.prepare(media.load(job.mediaIds().get(i)).path())));
            }
            Map<Integer, String> texts = new HashMap<>();
            String carryOver = null;
            for (List<PageImage> batch : ChapterBatches.split(images, pagesPerRequest, ChapterBatches.MAX_BYTES)) {
                List<TranslatedPage> got = translator.translate(new ChapterPrompt(job.novelTitle(), job.chapterNo(),
                        job.profile(), job.notebookText(), job.previousText(), carryOver, batch));
                got.forEach(p -> texts.put(p.page(), p.text()));
                carryOver = tail(String.join("\n\n", got.stream().map(TranslatedPage::text).toList()),
                        CARRY_OVER_CHARS);
            }
            save(chapterId, texts);
        } catch (TranslationFailedException e) {
            log.warn("Translation of chapter {} failed: {}", chapterId, e.userMessage());
            fail(chapterId, e.userMessage());
        } catch (UnknownProfileException e) {
            fail(chapterId, "Could not translate: the novel's translation profile can no longer be used.");
        } catch (RuntimeException e) {
            log.warn("Translation of chapter {} failed: {}", chapterId, e.getClass().getName());
            fail(chapterId, "Could not translate: " + e.getClass().getSimpleName() + ".");
        }
    }

    private Job load(long chapterId) {
        Chapter c = chapters.findById(chapterId).orElse(null);
        if (c == null) {
            return null;
        }
        Novel n = c.getNovel();
        String profile = profiles.read(n.getPromptProfile() == null ? "" : n.getPromptProfile());
        List<Long> mediaIds = pages.findByChapterIdOrderByPosition(chapterId).stream()
                .map(p -> p.getMedia().getId()).toList();
        return new Job(n.getId(), c.getChapterNo(), n.getTitle(), profile,
                notebook.textBefore(n.getId(), c.getChapterNo()), previousText(n.getId(), c.getChapterNo()),
                mediaIds);
    }

    /** The nearest earlier chapter whose every page has text, joined, at most the last 20,000 characters. */
    private String previousText(long novelId, int chapterNo) {
        for (Chapter prev : chapters.findByNovelIdAndChapterNoLessThanOrderByChapterNoDesc(novelId, chapterNo)) {
            List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(prev.getId());
            if (!ps.isEmpty() && ps.stream().allMatch(p -> p.getTextVi() != null && !p.getTextVi().isBlank())) {
                return tail(String.join("\n\n", ps.stream().map(ChapterPage::getTextVi).toList()),
                        PREVIOUS_TEXT_CHARS);
            }
        }
        return null;
    }

    private void save(long chapterId, Map<Integer, String> texts) {
        tx.executeWithoutResult(status -> {
            Chapter c = chapters.findById(chapterId).orElse(null);
            if (c == null) {
                log.info("Chapter {} was deleted while it was being translated", chapterId);
                return;
            }
            List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(chapterId);
            if (ps.size() != texts.size()) {
                failInTx(c, "The chapter's pages changed during translation, translate again.");
                return;
            }
            for (int i = 0; i < ps.size(); i++) {
                ps.get(i).setTextVi(texts.get(i + 1));
            }
            c.setTranslationStatus(ChapterTranslationStatus.TRANSLATED);
            c.setTranslationError(null);
            c.setTranslatedAt(clock.instant());
            c.setEditedAfterTranslation(false);
            c.touch(clock.instant());
            c.getNovel().touch(clock.instant());
            chapters.flush();
            if (c.getPublishStatus() == ChapterPublishStatus.PUBLISHED) {
                scheduler.scheduleUpdate(c.getNovel().getId(), c.getChapterNo());
            }
        });
    }

    private void fail(long chapterId, String message) {
        tx.executeWithoutResult(status -> chapters.findById(chapterId).ifPresent(c -> failInTx(c, message)));
    }

    private void failInTx(Chapter c, String message) {
        c.setTranslationStatus(ChapterTranslationStatus.FAILED);
        c.setTranslationError(message.length() > MAX_ERROR_LENGTH ? message.substring(0, MAX_ERROR_LENGTH) : message);
        chapters.flush();
    }

    private static String tail(String text, int max) {
        return text.length() <= max ? text : text.substring(text.length() - max);
    }
}
