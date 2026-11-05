package com.subtitlestudio.novel;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.translate.PromptProfileStore;
import com.subtitlestudio.translate.TranslationFailedException;
import com.subtitlestudio.translate.UnknownProfileException;
import java.time.Clock;
import java.util.ArrayDeque;
import java.util.Deque;
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
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Keeps each novel's story notebook (spec section 5). Updates run in the background, one at a time per novel, after
 * the transaction that published the chapter commits. {@code notebook_pending_chapter_no} remembers the chapter of
 * the running or last failed update so Retry can run it again.
 */
@Service
public class NotebookService implements NotebookScheduler, NotebookPromptSource {

    static final String INTERRUPTED = "Notebook update was interrupted.";
    private static final int MAX_ERROR_LENGTH = 500;
    private static final Logger log = LoggerFactory.getLogger(NotebookService.class);

    private record Job(String profile, String notebookText, NotebookContent old, String chapterText) {}

    private final SubtitleStudioProperties.Gemini gemini;
    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final NovelNotebookRepository notebooks;
    private final NotebookUpdater updater;
    private final PromptProfileStore profiles;
    private final ObjectMapper mapper;
    private final TransactionTemplate tx;
    private final Executor executor;
    private final Clock clock;
    /** Chapters waiting per novel; the head is running. Guarded by {@code this}. */
    private final Map<Long, Deque<Integer>> queues = new HashMap<>();

    public NotebookService(SubtitleStudioProperties properties, NovelRepository novels, ChapterRepository chapters,
                           ChapterPageRepository pages,
                           NovelNotebookRepository notebooks, NotebookUpdater updater, PromptProfileStore profiles,
                           ObjectMapper mapper, TransactionTemplate tx,
                           @Qualifier("translationExecutor") Executor executor, Clock clock) {
        this.gemini = properties.gemini();
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.notebooks = notebooks;
        this.updater = updater;
        this.profiles = profiles;
        this.mapper = mapper;
        this.tx = tx;
        this.executor = executor;
        this.clock = clock;
    }

    /** Without GEMINI_API_KEY nothing is sent anywhere: the notebook simply stays as it is. */
    @Override
    public void scheduleUpdate(long novelId, int chapterNo) {
        if (!gemini.configured()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    enqueue(novelId, chapterNo);
                }
            });
        } else {
            enqueue(novelId, chapterNo);
        }
    }

    @Override
    public String textBefore(long novelId, int chapterNo) {
        return tx.execute(status -> notebooks
                .findTopByNovelIdAndAfterChapterNoLessThanOrderByAfterChapterNoDesc(novelId, chapterNo)
                .map(n -> NotebookText.render(parse(n.getContentJson()), NotebookText.MAX_CHARS))
                .orElse(null));
    }

    public NotebookView view(long novelId, Integer after) {
        return tx.execute(status -> {
            Novel novel = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
            List<NovelNotebook> all = notebooks.findByNovelIdOrderByAfterChapterNo(novelId);
            List<Integer> versions = all.stream().map(NovelNotebook::getAfterChapterNo).toList();
            NovelNotebook selected = after == null
                    ? (all.isEmpty() ? null : all.getLast())
                    : all.stream().filter(n -> n.getAfterChapterNo() == after).findFirst().orElse(null);
            if (selected == null) {
                return new NotebookView(null, null, versions, novel.getNotebookStatus(), novel.getNotebookError(),
                        false);
            }
            boolean stale = all.stream().anyMatch(n -> n.getAfterChapterNo() > selected.getAfterChapterNo()
                    && n.getCreatedAt().isBefore(selected.getCreatedAt()));
            return new NotebookView(selected.getAfterChapterNo(), parse(selected.getContentJson()), versions,
                    novel.getNotebookStatus(), novel.getNotebookError(), stale);
        });
    }

    /** Runs the last failed update again. */
    public void retry(long novelId) {
        Integer chapterNo = tx.execute(status -> {
            Novel novel = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
            if (novel.getNotebookStatus() == NotebookStatus.UPDATING) {
                throw new NotebookUpdateInProgressException(novelId);
            }
            return novel.getNotebookPendingChapterNo();
        });
        if (chapterNo != null) {
            scheduleUpdate(novelId, chapterNo);
        }
    }

    /** At startup nothing can still be running: earlier runs died with the previous process. */
    @EventListener(ApplicationReadyEvent.class)
    public void markInterrupted() {
        tx.executeWithoutResult(status -> novels.findByNotebookStatus(NotebookStatus.UPDATING).forEach(n -> {
            n.setNotebookStatus(NotebookStatus.FAILED);
            n.setNotebookError(INTERRUPTED);
        }));
    }

    private void enqueue(long novelId, int chapterNo) {
        boolean start;
        synchronized (this) {
            Deque<Integer> queue = queues.computeIfAbsent(novelId, id -> new ArrayDeque<>());
            // Already waiting: that run will read the newest text. The running one (head) may be queued again.
            if (queue.stream().skip(1).anyMatch(no -> no == chapterNo)) {
                return;
            }
            queue.addLast(chapterNo);
            start = queue.size() == 1;
        }
        if (start) {
            executor.execute(() -> drain(novelId));
        }
    }

    private void drain(long novelId) {
        while (true) {
            Integer chapterNo;
            synchronized (this) {
                chapterNo = queues.get(novelId).peekFirst();
            }
            try {
                runOne(novelId, chapterNo);
            } catch (RuntimeException e) {
                log.warn("Notebook update of novel {} failed: {}", novelId, e.getClass().getName());
            }
            synchronized (this) {
                Deque<Integer> queue = queues.get(novelId);
                queue.pollFirst();
                if (queue.isEmpty()) {
                    queues.remove(novelId);
                    return;
                }
            }
        }
    }

    private void runOne(long novelId, int chapterNo) {
        Job job = tx.execute(status -> begin(novelId, chapterNo));
        if (job == null) {
            return;
        }
        try {
            NotebookUpdate update = updater.propose(job.profile(), job.notebookText(), chapterNo, job.chapterText());
            NotebookContent merged = NotebookMerger.merge(job.old(), update, chapterNo);
            tx.executeWithoutResult(status -> save(novelId, chapterNo, merged));
        } catch (TranslationFailedException e) {
            fail(novelId, e.userMessage());
        } catch (InvalidNotebookUpdateException e) {
            fail(novelId, e.getMessage());
        } catch (RuntimeException e) {
            // Anything else must not leave the novel UPDATING (Retry would refuse until a restart).
            log.warn("Notebook update of novel {} failed: {}", novelId, e.getClass().getName());
            fail(novelId, "Could not update the notebook: " + e.getClass().getSimpleName() + ".");
        }
    }

    /** Marks the novel UPDATING and reads what Gemini needs; null when the novel or chapter is gone. */
    private Job begin(long novelId, int chapterNo) {
        Novel novel = novels.findById(novelId).orElse(null);
        if (novel == null) {
            return null;
        }
        novel.setNotebookStatus(NotebookStatus.UPDATING);
        novel.setNotebookError(null);
        novel.setNotebookPendingChapterNo(chapterNo);
        Chapter chapter = chapters.findByNovelIdAndChapterNo(novelId, chapterNo).orElse(null);
        List<ChapterPage> ps = chapter == null ? List.of() : pages.findByChapterIdOrderByPosition(chapter.getId());
        if (ps.isEmpty() || ps.stream().anyMatch(p -> p.getTextVi() == null || p.getTextVi().isBlank())) {
            failInTx(novel, "Chapter " + chapterNo + " has no complete translation to update the notebook from.");
            return null;
        }
        NotebookContent old = notebooks
                .findTopByNovelIdAndAfterChapterNoLessThanOrderByAfterChapterNoDesc(novelId, chapterNo)
                .map(n -> parse(n.getContentJson())).orElse(null);
        return new Job(profile(novel), old == null ? null : NotebookText.render(old, NotebookText.MAX_CHARS),
                old == null ? NotebookContent.EMPTY : old,
                String.join("\n\n", ps.stream().map(ChapterPage::getTextVi).toList()));
    }

    private void save(long novelId, int chapterNo, NotebookContent content) {
        Novel novel = novels.findById(novelId).orElse(null);
        if (novel == null) {
            log.info("Novel {} was deleted while its notebook was being updated", novelId);
            return;
        }
        String json = write(content);
        notebooks.findByNovelIdAndAfterChapterNo(novelId, chapterNo).ifPresentOrElse(
                n -> n.replace(json, clock.instant()),
                () -> notebooks.save(new NovelNotebook(novel, chapterNo, json, clock.instant())));
        novel.setNotebookStatus(NotebookStatus.IDLE);
        novel.setNotebookError(null);
        novel.setNotebookPendingChapterNo(null);
    }

    private void fail(long novelId, String message) {
        tx.executeWithoutResult(status -> novels.findById(novelId).ifPresent(n -> failInTx(n, message)));
    }

    private static void failInTx(Novel novel, String message) {
        novel.setNotebookStatus(NotebookStatus.FAILED);
        novel.setNotebookError(message.length() > MAX_ERROR_LENGTH ? message.substring(0, MAX_ERROR_LENGTH) : message);
    }

    private String profile(Novel novel) {
        if (novel.getPromptProfile() == null) {
            return "";
        }
        try {
            return profiles.read(novel.getPromptProfile());
        } catch (UnknownProfileException e) {
            return "";
        }
    }

    private NotebookContent parse(String json) {
        try {
            return mapper.readValue(json, NotebookContent.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Stored notebook is not valid JSON", e);
        }
    }

    private String write(NotebookContent content) {
        try {
            return mapper.writeValueAsString(content);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
