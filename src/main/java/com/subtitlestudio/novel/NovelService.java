package com.subtitlestudio.novel;

import com.subtitlestudio.novel.render.RenderCache;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaFiler;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.MediaService;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Create, edit, list and delete novels (spec section 6). */
@Service
public class NovelService {

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final NovelNotebookRepository notebooks;
    private final MediaRepository media;
    private final MediaService mediaService;
    private final NovelValidator validator;
    private final RenderCache renderCache;
    private final Clock clock;
    private final TranslatingModels models;
    private final MediaFiler mediaFiler;

    public NovelService(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                        NovelNotebookRepository notebooks, MediaRepository media, MediaService mediaService,
                        NovelValidator validator, RenderCache renderCache, Clock clock,
                        TranslatingModels models, MediaFiler mediaFiler) {
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.notebooks = notebooks;
        this.media = media;
        this.mediaService = mediaService;
        this.validator = validator;
        this.renderCache = renderCache;
        this.clock = clock;
        this.models = models;
        this.mediaFiler = mediaFiler;
    }

    @Transactional(readOnly = true)
    public List<NovelSummary> list() {
        return novels.findAllByOrderByUpdatedAtDesc().stream().map(n -> {
            List<Chapter> cs = chapters.findByNovelIdOrderByChapterNo(n.getId());
            int published = (int) cs.stream()
                    .filter(c -> c.getPublishStatus() == ChapterPublishStatus.PUBLISHED).count();
            return new NovelSummary(n.getId(), n.getSlug(), n.getTitle(), coverUrl(n), n.getNovelStatus(), cs.size(),
                    published, n.getUpdatedAt());
        }).toList();
    }

    @Transactional(readOnly = true)
    public NovelDetail get(long id) {
        return detail(find(id));
    }

    @Transactional
    public NovelDetail create(NovelRequest request) {
        NovelRequest r = validator.validate(request);
        if (novels.existsBySlug(r.slug())) {
            throw new DuplicateNovelSlugException(r.slug());
        }
        Novel n = new Novel(r.slug(), r.title(), r.novelStatus(), clock.instant());
        apply(n, r);
        return detail(novels.save(n));
    }

    @Transactional
    public NovelDetail update(long id, NovelRequest request) {
        Novel n = find(id);
        NovelRequest r = validator.validate(request);
        if (!r.slug().equals(n.getSlug()) && novels.existsBySlug(r.slug())) {
            throw new DuplicateNovelSlugException(r.slug());
        }
        Long oldCover = n.getCover() == null ? null : n.getCover().getId();
        boolean renamed = !r.slug().equals(n.getSlug());
        n.setSlug(r.slug());
        n.setTitle(r.title());
        n.setNovelStatus(r.novelStatus());
        apply(n, r);
        n.touch(clock.instant());
        novels.flush();
        if (renamed) {
            // Page screenshots live in novels/<slug>/, so a new slug means a new folder.
            mediaFiler.fileNovelPagesAfterCommit(n.getId());
        }
        if (oldCover != null && !oldCover.equals(r.coverMediaId())) {
            mediaService.deleteIfUnreferenced(List.of(oldCover));
        }
        return detail(n);
    }

    /** Deletes the novel, its chapters, pages and notebooks, and the images nothing else uses. */
    @Transactional
    public void delete(long id) {
        Novel n = find(id);
        List<Long> images = new ArrayList<>();
        if (n.getCover() != null) {
            images.add(n.getCover().getId());
        }
        List<Chapter> cs = chapters.findByNovelIdOrderByChapterNo(id);
        for (Chapter c : cs) {
            List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(c.getId());
            ps.forEach(p -> images.add(p.getMedia().getId()));
            pages.deleteAll(ps);
        }
        chapters.deleteAll(cs);
        notebooks.deleteAll(notebooks.findByNovelIdOrderByAfterChapterNo(id));
        novels.delete(n);
        novels.flush();
        mediaService.deleteIfUnreferenced(images);
        cs.forEach(c -> renderCache.evict(c.getId()));
    }

    Novel find(long id) {
        return novels.findById(id).orElseThrow(() -> new NovelNotFoundException(id));
    }

    private void apply(Novel n, NovelRequest r) {
        n.setCover(cover(r.coverMediaId()));
        n.setOriginalAuthor(r.originalAuthor());
        n.setDescription(r.description());
        n.setTags(r.tags().isEmpty() ? null : String.join(",", r.tags()));
        n.setTranslatorCredit(r.translatorCredit());
        n.setSourceUrl(r.sourceUrl());
        n.setPromptProfile(r.promptProfile());
        n.setTrailerVideoId(r.trailerUrl());
    }

    private Media cover(Long mediaId) {
        if (mediaId == null) {
            return null;
        }
        return media.findById(mediaId).orElseThrow(() -> new InvalidNovelException(
                List.of(new FieldError("coverMediaId", "The cover image was not found."))));
    }

    NovelDetail detail(Novel n) {
        List<ChapterPage> novelPages = pages.findByChapterNovelId(n.getId());
        Double median = SuspectPages.novelMedian(novelPages);
        Map<Long, Integer> suspect = new HashMap<>();
        novelPages.stream().filter(p -> SuspectPages.suspect(p.getTextVi(), p.getSourceTh(), median))
                .forEach(p -> suspect.merge(p.getChapter().getId(), 1, Integer::sum));
        List<ChapterSummary> list = chapters.findByNovelIdOrderBySortOrderAscChapterNoAsc(n.getId()).stream()
                .map(c -> new ChapterSummary(c.getId(), c.getChapterNo(), c.getTitle(), c.getLabel(),
                        c.getTranslationStatus(),
                        c.getTranslationError(), models.shown(c), c.getPublishStatus(), (int) pages.countByChapterId(c.getId()),
                        suspect.getOrDefault(c.getId(), 0)))
                .toList();
        return new NovelDetail(n.getId(), n.getSlug(), n.getTitle(),
                n.getCover() == null ? null : n.getCover().getId(), coverUrl(n), n.getOriginalAuthor(),
                n.getDescription(), tags(n), n.getNovelStatus(), n.getTranslatorCredit(), n.getSourceUrl(),
                n.getPromptProfile(), n.getTrailerVideoId(),
                n.getNotebookStatus(), n.getNotebookError(), list);
    }

    static List<String> tags(Novel n) {
        return n.getTags() == null ? List.of() : Arrays.asList(n.getTags().split(","));
    }

    private static String coverUrl(Novel n) {
        return n.getCover() == null ? null : "/api/media/" + n.getCover().getId();
    }
}
