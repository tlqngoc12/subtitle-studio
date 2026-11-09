package com.subtitlestudio.novel;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.translate.GeminiNotConfiguredException;
import com.subtitlestudio.translate.TranslationFailedException;
import com.subtitlestudio.translate.UnknownProfileException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Translates a chapter in the background (spec section 4): pages go to Gemini in batches with the profile, the story
 * notebook and the end of the previous chapter. Pages Gemini already translated are saved even when a later request
 * fails, and after a failure Translate again sends only the pages still without text, so no request is paid twice.
 * Also publish / unpublish.
 */
@Service
public class ChapterTranslationService {

    static final String INTERRUPTED = "Translation was interrupted.";
    static final int PREVIOUS_TEXT_CHARS = 4_000;
    static final int CARRY_OVER_CHARS = 2_000;
    private static final int MAX_ERROR_LENGTH = 500;
    private static final Logger log = LoggerFactory.getLogger(ChapterTranslationService.class);

    /** What the background run needs, read in one transaction. */
    private record Job(long novelId, int chapterNo, String chapterLabel, String novelTitle, String profile, String notebookText,
                       String previousText, List<Long> pageIds, List<Long> mediaIds, Map<Integer, String> kept) {}

    private final SubtitleStudioProperties.Gemini gemini;
    private final int pagesPerRequest;
    private final NovelProfileStore profiles;
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

    public ChapterTranslationService(SubtitleStudioProperties properties, NovelProfileStore profiles,
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
        boolean[] resume = {false};
        ChapterDetail started = tx.execute(status -> {
            Chapter c = chapterService.find(chapterId);
            if (c.getPublishStatus() == ChapterPublishStatus.PUBLISHED) {
                throw new ChapterPublishedException(chapterId);
            }
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
            resume[0] = c.getTranslationStatus() == ChapterTranslationStatus.FAILED;
            c.setTranslationStatus(ChapterTranslationStatus.TRANSLATING);
            c.setTranslationError(null);
            chapters.flush();
            return chapterService.detail(c);
        });
        boolean resuming = resume[0];
        executor.execute(() -> run(chapterId, resuming));
        return started;
    }

    public ChapterDetail publish(long chapterId) {
        return tx.execute(status -> {
            Chapter c = chapterService.find(chapterId);
            if (c.getTranslationStatus() == ChapterTranslationStatus.TRANSLATING) {
                throw new ChapterTranslationInProgressException(chapterId);
            }
            if (!ChapterText.complete(c, pages.findByChapterIdOrderByPosition(chapterId))) {
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

    private void run(long chapterId, boolean resume) {
        try {
            runTranslation(chapterId, resume);
        } finally {
            chapterService.models().clear(chapterId);
        }
    }

    private void runTranslation(long chapterId, boolean resume) {
        Job job;
        try {
            job = tx.execute(status -> load(chapterId, resume));
        } catch (UnknownProfileException e) {
            fail(chapterId, "Could not translate: the novel's translation profile can no longer be used.");
            return;
        } catch (RuntimeException e) {
            log.warn("Translation of chapter {} failed: {}", chapterId, e.getClass().getName());
            fail(chapterId, "Could not translate: " + e.getClass().getSimpleName() + ".");
            return;
        }
        if (job == null) {
            return;
        }
        Map<Integer, String> texts = new HashMap<>(job.kept());
        Map<Integer, String> sources = new HashMap<>();
        Set<String> used = new LinkedHashSet<>(); // models that answered, in order of use
        try {
            List<PageImage> images = new ArrayList<>();
            for (int i = 0; i < job.mediaIds().size(); i++) {
                if (!job.kept().containsKey(i + 1)) {
                    images.add(new PageImage(i + 1, preparer.prepare(media.load(job.mediaIds().get(i)).path())));
                }
            }
            for (List<PageImage> batch : ChapterBatches.split(images, pagesPerRequest, ChapterBatches.MAX_BYTES)) {
                List<TranslatedPage> got;
                String[] lastTried = {null};
                Consumer<String> onTrying = model -> {
                    lastTried[0] = model;
                    chapterService.models().set(chapterId, model);
                };
                try {
                    got = translator.translate(new ChapterPrompt(job.novelTitle(), job.chapterNo(), job.chapterLabel(),
                            job.profile(),
                            job.notebookText(), job.previousText(), carryOver(texts, batch.getFirst().page()),
                            batch), onTrying);
                } catch (ChapterPartlyTranslatedException e) {
                    e.done().forEach(p -> {
                        texts.put(p.page(), p.text());
                        sources.put(p.page(), p.source());
                    });
                    throw e;
                }
                if (lastTried[0] != null) {
                    used.add(lastTried[0]);
                }
                got.forEach(p -> {
                    texts.put(p.page(), p.text());
                    sources.put(p.page(), p.source());
                });
            }
            save(chapterId, job, texts, sources, used.isEmpty() ? null : String.join(", ", used));
        } catch (TranslationFailedException e) {
            log.warn("Translation of chapter {} failed: {}", chapterId, e.userMessage());
            saveFailed(chapterId, job, texts, sources, e.userMessage());
        } catch (RuntimeException e) {
            log.warn("Translation of chapter {} failed: {}", chapterId, e.getClass().getName());
            saveFailed(chapterId, job, texts, sources, "Could not translate: " + e.getClass().getSimpleName() + ".");
        }
    }

    /** The end of what comes right before {@code firstPage} in this chapter, so the next request reads on. */
    private static String carryOver(Map<Integer, String> texts, int firstPage) {
        List<String> before = texts.entrySet().stream().filter(e -> e.getKey() < firstPage)
                .sorted(Map.Entry.comparingByKey()).map(Map.Entry::getValue).toList();
        return before.isEmpty() ? null : tail(String.join("\n\n", before), CARRY_OVER_CHARS);
    }

    /**
     * After a failed run only the pages without text are translated again (their numbers stay the same); otherwise
     * the whole chapter.
     */
    private Job load(long chapterId, boolean resume) {
        Chapter c = chapters.findById(chapterId).orElse(null);
        if (c == null) {
            return null;
        }
        Novel n = c.getNovel();
        String profile = profiles.read(n.getPromptProfile() == null ? "" : n.getPromptProfile());
        List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(chapterId);
        Map<Integer, String> kept = new HashMap<>();
        if (resume) {
            for (int i = 0; i < ps.size(); i++) {
                String text = ps.get(i).getTextVi();
                if (text != null && !text.isBlank()) {
                    kept.put(i + 1, text);
                }
            }
            if (kept.size() == ps.size()) {
                kept.clear();
            }
        }
        return new Job(n.getId(), c.getChapterNo(), c.getLabel(), n.getTitle(), profile,
                notebook.textBefore(n.getId(), c.getChapterNo()), previousText(n.getId(), c.getChapterNo()),
                ps.stream().map(ChapterPage::getId).toList(), ps.stream().map(p -> p.getMedia().getId()).toList(),
                kept);
    }

    /** The nearest earlier chapter whose every page has text, joined, at most the last 20,000 characters. */
    private String previousText(long novelId, int chapterNo) {
        for (Chapter prev : chapters.findByNovelIdAndChapterNoLessThanOrderByChapterNoDesc(novelId, chapterNo)) {
            List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(prev.getId());
            if (ChapterText.complete(prev, ps)) {
                return tail(ChapterText.of(prev, ps), PREVIOUS_TEXT_CHARS);
            }
        }
        return null;
    }

    private void save(long chapterId, Job job, Map<Integer, String> texts, Map<Integer, String> sources,
                      String model) {
        tx.executeWithoutResult(status -> {
            Chapter c = chapters.findById(chapterId).orElse(null);
            if (c == null) {
                log.info("Chapter {} was deleted while it was being translated", chapterId);
                return;
            }
            List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(chapterId);
            if (!samePages(ps, job)) {
                failInTx(c, "The chapter's pages changed during translation, translate again.");
                return;
            }
            for (int i = 0; i < ps.size(); i++) {
                ps.get(i).setTextVi(texts.get(i + 1));
                if (!job.kept().containsKey(i + 1)) {
                    ps.get(i).setSourceTh(sources.get(i + 1));
                }
            }
            c.setTextVi(null); // the new translation replaces the edited whole text
            c.setTranslationStatus(ChapterTranslationStatus.TRANSLATED);
            c.setTranslationError(null);
            c.setTranslatedAt(clock.instant());
            if (model != null) {
                c.setTranslationModel(model);
            }
            c.setEditedAfterTranslation(false);
            c.touch(clock.instant());
            c.getNovel().touch(clock.instant());
            chapters.flush();
        });
    }

    /**
     * Keeps the pages Gemini did translate (other pages keep their text) and marks the chapter FAILED; the message
     * says how far it got when pages are still without text.
     */
    private void saveFailed(long chapterId, Job job, Map<Integer, String> texts, Map<Integer, String> sources,
                            String message) {
        tx.executeWithoutResult(status -> {
            Chapter c = chapters.findById(chapterId).orElse(null);
            if (c == null) {
                return;
            }
            List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(chapterId);
            if (!samePages(ps, job)) {
                failInTx(c, message);
                return;
            }
            boolean saved = false;
            for (int i = 0; i < ps.size(); i++) {
                String text = texts.get(i + 1);
                if (text != null && !job.kept().containsKey(i + 1)) {
                    ps.get(i).setTextVi(text);
                    ps.get(i).setSourceTh(sources.get(i + 1));
                    saved = true;
                }
            }
            if (saved) {
                c.touch(clock.instant());
            }
            long withText = ps.stream().filter(p -> p.getTextVi() != null && !p.getTextVi().isBlank()).count();
            failInTx(c, withText > 0 && withText < ps.size()
                    ? message + " " + withText + " of " + ps.size()
                            + " pages are translated; Translate again does only the missing ones."
                    : message);
        });
    }

    private static boolean samePages(List<ChapterPage> ps, Job job) {
        return ps.stream().map(ChapterPage::getId).toList().equals(job.pageIds());
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
