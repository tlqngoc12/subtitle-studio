package com.subtitlestudio.novel;

import com.subtitlestudio.config.GeminiSettings;
import com.subtitlestudio.novel.render.RenderCache;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaFiler;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.MediaService;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Create, edit, list and delete novels (spec section 6). */
@Service
public class NovelService {

    static final int MAX_BANNER = 5;
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(NovelService.class);

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final ChapterImageRepository chapterImages;
    private final MediaRepository media;
    private final MediaService mediaService;
    private final NovelValidator validator;
    private final RenderCache renderCache;
    private final Clock clock;
    private final TranslatingModels models;
    private final MediaFiler mediaFiler;
    private final GeminiSettings gemini;
    private final NovelProfileStore profiles;
    private final ChapterReviewFiles reviewFiles;

    public NovelService(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                        ChapterImageRepository chapterImages, MediaRepository media, MediaService mediaService,
                        NovelValidator validator, RenderCache renderCache, Clock clock,
                        TranslatingModels models, MediaFiler mediaFiler,
                        GeminiSettings gemini, NovelProfileStore profiles, ChapterReviewFiles reviewFiles) {
        this.reviewFiles = reviewFiles;
        this.gemini = gemini;
        this.profiles = profiles;
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.chapterImages = chapterImages;
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
        Map<Long, NovelChapterStats> stats = new HashMap<>();
        chapters.chapterStats().forEach(s -> stats.put(s.novelId(), s));
        return novels.findAllByOrderByUpdatedAtDesc().stream()
                .map(n -> summary(n, stats.get(n.getId()))).toList();
    }

    /** {@code stats} is null for a novel without chapters. */
    private NovelSummary summary(Novel n, NovelChapterStats stats) {
        long chapterCount = stats == null ? 0 : stats.chapters();
        long publishedCount = stats == null ? 0 : stats.published();
        Instant lastPublishedAt = stats == null ? null : stats.lastPublishedAt();
        return new NovelSummary(n.getId(), n.getSlug(), n.getTitle(), coverUrl(n), n.getNovelStatus(),
                (int) chapterCount, (int) publishedCount, n.getUpdatedAt(), n.getWattpadStoryId(), n.isFeatured(), n.getCreatedAt(),
                lastPublishedAt, n.getOriginalAuthor(), n.getDescription(), tags(n), n.getSourceType());
    }

    /** Picks or unpicks a novel for the public banner (at most 5). Does not touch updatedAt. */
    @Transactional
    public NovelSummary setFeatured(long id, boolean featured) {
        Novel n = find(id);
        if (featured && !n.isFeatured() && novels.countByFeaturedTrue() >= MAX_BANNER) {
            throw new BannerFullException();
        }
        n.setFeatured(featured);
        return summary(novels.save(n), chapters.chapterStats(id));
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
        if (r.wattpadStoryId() != null) {
            novels.findByWattpadStoryId(r.wattpadStoryId()).ifPresent(existing -> {
                throw r.sourceType() == NovelSourceType.ORIGINAL
                        ? DuplicateWattpadNovelException.linked(existing.getTitle(), existing.getId())
                        : new DuplicateWattpadNovelException(existing.getTitle(), existing.getId());
            });
        }
        // An original story with no profile chosen gets one made from the original-story template.
        String createdProfile = null;
        if (r.sourceType() == NovelSourceType.ORIGINAL && r.promptProfile() == null) {
            createdProfile = NovelProfileNames.forOriginal(r.title(), profiles::exists);
            profiles.create(createdProfile, NovelProfileTemplate.render(r.sourceLanguage(), r.title(),
                    r.originalAuthor(), r.tags(), r.description()));
            r = withProfile(r, createdProfile);
        }
        try {
            Novel n = new Novel(r.slug(), r.title(), r.novelStatus(), clock.instant());
            n.setSourceType(r.sourceType());
            n.setWattpadStoryId(r.wattpadStoryId());
            apply(n, r);
            return detail(novels.save(n));
        } catch (RuntimeException e) {
            if (createdProfile != null) {
                profiles.delete(createdProfile);
            }
            throw e;
        }
    }

    private static NovelRequest withProfile(NovelRequest r, String profile) {
        return new NovelRequest(r.slug(), r.title(), r.coverMediaId(), r.originalAuthor(), r.description(), r.tags(),
                r.novelStatus(), r.translatorCredit(), r.sourceUrl(), profile, r.trailerUrl(), r.sourceType(),
                r.sourceLanguage(), r.wattpadStoryId(), r.coverUrl(), r.wattpadUrl());
    }

    /** The kind of a novel never changes: an original stays original, and no other novel becomes one. */
    private static NovelRequest keepingKind(Novel n, NovelRequest r) {
        boolean original = n.getSourceType() == NovelSourceType.ORIGINAL;
        if (original) {
            return withKind(r, NovelSourceType.ORIGINAL);
        }
        if (r.sourceType() == NovelSourceType.ORIGINAL) {
            throw new InvalidNovelException(List.of(new FieldError("sourceType",
                    "A translated novel cannot become an original story.")));
        }
        return r;
    }

    private static NovelRequest withKind(NovelRequest r, NovelSourceType type) {
        return new NovelRequest(r.slug(), r.title(), r.coverMediaId(), r.originalAuthor(), r.description(), r.tags(),
                r.novelStatus(), r.translatorCredit(), r.sourceUrl(), r.promptProfile(), r.trailerUrl(), type,
                r.sourceLanguage(), r.wattpadStoryId(), r.coverUrl(), r.wattpadUrl());
    }

    @Transactional
    public NovelDetail update(long id, NovelRequest request) {
        Novel n = find(id);
        NovelRequest r = validator.validate(keepingKind(n, request));
        if (!r.slug().equals(n.getSlug()) && novels.existsBySlug(r.slug())) {
            throw new DuplicateNovelSlugException(r.slug());
        }
        if (n.getSourceType() == NovelSourceType.ORIGINAL) {
            if (r.wattpadStoryId() != null) {
                novels.findByWattpadStoryId(r.wattpadStoryId()).filter(existing -> !existing.getId().equals(n.getId()))
                        .ifPresent(existing -> {
                            throw DuplicateWattpadNovelException.linked(existing.getTitle(), existing.getId());
                        });
            }
            n.setWattpadStoryId(r.wattpadStoryId());
        }
        Long oldCover = n.getCover() == null ? null : n.getCover().getId();
        boolean renamed = !r.slug().equals(n.getSlug());
        String oldTitle = n.getTitle();
        String oldProfile = n.getPromptProfile();
        boolean followTitle = !r.title().equals(oldTitle) && oldProfile != null
                && oldProfile.equals(r.promptProfile());
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
        // Last, so a failure above (which rolls the transaction back) never leaves a renamed file behind.
        if (followTitle) {
            followTitle(n, oldTitle, oldProfile);
        }
        return detail(n);
    }

    /**
     * Renames an auto-created profile (and its history) to match the new title, and updates the title lines inside it.
     * Leaves a shared or hand-picked profile alone. A failure propagates so the novel is not saved with the new title.
     */
    private void followTitle(Novel n, String oldTitle, String oldProfile) {
        if (novels.countByPromptProfile(oldProfile) > 1) {
            return;
        }
        if (!NovelProfileNames.isDerived(oldProfile, derivedName(n, oldTitle, name -> false))) {
            return;
        }
        String newTitle = n.getTitle();
        String newName = derivedName(n, newTitle,
                name -> !name.equalsIgnoreCase(oldProfile) && profiles.exists(name));
        profiles.rename(oldProfile, newName, text -> ProfileTitleLines.retitle(text, oldTitle, newTitle));
        reviewFiles.renameProfile(oldProfile, newName);
        n.setPromptProfile(newName);
        log.info("Renamed profile {} to {} for novel {}", oldProfile, newName, n.getId());
    }

    private static String derivedName(Novel n, String title, java.util.function.Predicate<String> taken) {
        return n.getSourceType() == NovelSourceType.WATTPAD && n.getWattpadStoryId() != null
                ? NovelProfileNames.fromTitle(title, n.getWattpadStoryId(), taken)
                : NovelProfileNames.forOriginal(title, taken);
    }

    /** Deletes the novel, its chapters and pages, and the images nothing else uses. */
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
            List<ChapterImage> inText = chapterImages.findByChapterIdOrderByPosition(c.getId());
            inText.forEach(i -> images.add(i.getMedia().getId()));
            chapterImages.deleteAll(inText);
        }
        chapters.deleteAll(cs);
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
        n.setSourceLanguage(r.sourceLanguage());
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
        Map<Long, Integer> pageCounts = new HashMap<>();
        pages.countPerChapter(n.getId()).forEach(row -> pageCounts.put((Long) row[0], ((Number) row[1]).intValue()));
        List<ChapterSummary> list = chapters.findRowsByNovel(n.getId()).stream()
                .map(c -> new ChapterSummary(c.id(), c.chapterNo(), c.title(),
                        c.translationStatus(),
                        c.translationError(), models.shown(c), c.publishStatus(), pageCounts.getOrDefault(c.id(), 0),
                        suspect.getOrDefault(c.id(), 0),
                        GeminiCaller.translatedByFallback(models.shown(c), gemini.current().model())))
                .toList();
        return new NovelDetail(n.getId(), n.getSlug(), n.getTitle(),
                n.getCover() == null ? null : n.getCover().getId(), coverUrl(n), n.getOriginalAuthor(),
                n.getDescription(), tags(n), n.getNovelStatus(), n.getTranslatorCredit(), n.getSourceUrl(),
                n.getPromptProfile(), n.getTrailerVideoId(),
                list, n.getSourceType(), n.getSourceLanguage(),
                n.getWattpadStoryId());
    }

    static List<String> tags(Novel n) {
        return n.getTags() == null ? List.of() : Arrays.asList(n.getTags().split(","));
    }

    private static String coverUrl(Novel n) {
        return n.getCover() == null ? null : "/api/media/" + n.getCover().getId();
    }
}
