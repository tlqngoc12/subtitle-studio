package com.subtitlestudio.novel;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.novel.render.RenderCache;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.ImageSniffer;
import com.subtitlestudio.profile.ImageType;
import com.subtitlestudio.profile.InvalidMediaException;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.profile.MediaTooLargeException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Chapters of a novel and their page screenshots and text (spec section 6). */
@Service
public class ChapterService {

    static final int MAX_TITLE = 200;
    static final int MAX_LABEL = 100;
    private static final Set<ImageType> PAGE_TYPES = Set.of(ImageType.PNG, ImageType.JPEG, ImageType.WEBP);

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final MediaService mediaService;
    private final ImageSniffer sniffer;
    private final RenderCache renderCache;
    private final PageRotator rotator;
    private final long maxImageBytes;
    private final Clock clock;
    private final TranslatingModels models;

    public ChapterService(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                          MediaService mediaService, ImageSniffer sniffer, RenderCache renderCache,
                          PageRotator rotator, SubtitleStudioProperties properties, Clock clock,
                          TranslatingModels models) {
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.mediaService = mediaService;
        this.sniffer = sniffer;
        this.renderCache = renderCache;
        this.rotator = rotator;
        this.maxImageBytes = properties.novel().maxPageImageSize().toBytes();
        this.clock = clock;
        this.models = models;
    }

    @Transactional
    public ChapterDetail add(long novelId, ChapterRequest request) {
        return detail(create(novelId, request));
    }

    /** Adds a DRAFT chapter at the end holding a Wattpad part's original text; returns its id. */
    @Transactional
    public long addFromSource(long novelId, String title, String sourceText, String wattpadPartId, Instant fetchedAt) {
        String shortTitle = title == null ? null : title.strip();
        if (shortTitle != null && shortTitle.length() > MAX_TITLE) {
            shortTitle = shortTitle.substring(0, MAX_TITLE);
        }
        Chapter c = create(novelId, new ChapterRequest(null, shortTitle));
        c.setSourceText(sourceText);
        c.setWattpadPartId(wattpadPartId);
        c.setSourceFetchedAt(fetchedAt);
        chapters.flush();
        return c.getId();
    }

    /** The Wattpad part id of a chapter whose original may be reloaded: a Draft that is not being translated. */
    @Transactional(readOnly = true)
    public String reloadablePartId(long id) {
        Chapter c = find(id);
        if (c.getPublishStatus() == ChapterPublishStatus.PUBLISHED) {
            throw new ChapterPublishedException(id);
        }
        if (c.getTranslationStatus() == ChapterTranslationStatus.TRANSLATING) {
            throw new ChapterTranslationInProgressException(id);
        }
        if (c.getWattpadPartId() == null) {
            throw new InvalidChapterException(List.of(new FieldError("chapter", "This chapter does not come from Wattpad.")));
        }
        return c.getWattpadPartId();
    }

    /** Replaces the original text of a Draft Wattpad chapter; the translation is not touched. */
    @Transactional
    public ChapterDetail replaceSourceText(long id, String sourceText, Instant fetchedAt) {
        reloadablePartId(id);
        Chapter c = find(id);
        c.setSourceText(sourceText);
        c.setSourceFetchedAt(fetchedAt);
        touch(c);
        return detail(c);
    }

    private Chapter create(long novelId, ChapterRequest request) {
        Novel novel = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
        List<Chapter> existing = chapters.findByNovelIdOrderByChapterNo(novelId);
        int no = request.chapterNo() != null ? request.chapterNo()
                : existing.isEmpty() ? 1 : existing.getLast().getChapterNo() + 1;
        String title = validate(no, request.title());
        if (existing.stream().anyMatch(c -> c.getChapterNo() == no)) {
            throw new DuplicateChapterNumberException(no);
        }
        novel.touch(clock.instant());
        Chapter created = new Chapter(novel, no, title, clock.instant());
        // New chapters go last in the reading order, whatever their number.
        created.setSortOrder(existing.stream().mapToInt(Chapter::getSortOrder).max().orElse(0) + 1);
        return chapters.save(created);
    }

    /** Sets the reading order; the list must name every chapter of the novel exactly once. Any publish status. */
    @Transactional
    public void reorderChapters(long novelId, ChapterOrderRequest request) {
        Novel novel = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
        List<Chapter> all = chapters.findByNovelIdOrderByChapterNo(novelId);
        List<Long> order = request == null || request.chapterIds() == null ? List.of() : request.chapterIds();
        Map<Long, Chapter> byId = new HashMap<>();
        all.forEach(c -> byId.put(c.getId(), c));
        if (order.size() != all.size() || new HashSet<>(order).size() != order.size()
                || !byId.keySet().containsAll(order)) {
            throw new InvalidChapterException(List.of(new FieldError("chapterIds",
                    "List every chapter of the novel exactly once.")));
        }
        for (int i = 0; i < order.size(); i++) {
            byId.get(order.get(i)).setSortOrder(i + 1);
        }
        novel.touch(clock.instant());
        chapters.flush();
    }

    @Transactional(readOnly = true)
    public ChapterDetail get(long id) {
        return detail(find(id));
    }

    @Transactional
    public ChapterDetail update(long id, ChapterUpdateRequest request) {
        Chapter c = editable(id);
        int no = request.chapterNo() != null ? request.chapterNo() : c.getChapterNo();
        String title = request.title() != null ? validate(no, request.title()) : validate(no, c.getTitle());
        if (no != c.getChapterNo()) {
            if (c.getPublishStatus() == ChapterPublishStatus.PUBLISHED) {
                throw new ChapterPublishedException(id);
            }
            chapters.findByNovelIdAndChapterNo(c.getNovel().getId(), no).ifPresent(other -> {
                throw new DuplicateChapterNumberException(no);
            });
            c.setChapterNo(no);
        }
        if (request.title() != null) {
            c.setTitle(title);
        }
        if (request.label() != null) {
            c.setLabel(label(request.label(), no));
        }
        boolean textChanged = false;
        if (request.pages() != null && !request.pages().isEmpty() && c.hasSourceText()) {
            throw new ChapterTextSourceException(id);
        }
        if (request.pages() != null) {
            Map<Long, ChapterPage> byId = new HashMap<>();
            pages.findByChapterIdOrderByPosition(id).forEach(p -> byId.put(p.getId(), p));
            for (PageTextEdit edit : request.pages()) {
                ChapterPage p = byId.get(edit.id());
                if (p == null) {
                    throw new PageNotFoundException(edit.id());
                }
                String text = edit.textVi() == null || edit.textVi().isBlank() ? null : edit.textVi();
                if (!Objects.equals(text, p.getTextVi())) {
                    p.setTextVi(text);
                    textChanged = true;
                }
            }
        }
        if (request.text() != null) {
            String text = request.text().isBlank() ? null : request.text();
            if (!Objects.equals(text, c.getTextVi())) {
                c.setTextVi(text);
                textChanged = true;
            }
        }
        if (textChanged) {
            c.setEditedAfterTranslation(true);
        }
        touch(c);
        // No notebook update here: it runs once, at Publish. Re-reading the chapter after every fix spent the
        // free Gemini quota on typo corrections.
        return detail(c);
    }

    @Transactional
    public void delete(long id) {
        Chapter c = editable(id);
        List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(id);
        List<Long> images = ps.stream().map(p -> p.getMedia().getId()).toList();
        pages.deleteAll(ps);
        c.getNovel().touch(clock.instant());
        chapters.delete(c);
        chapters.flush();
        mediaService.deleteIfUnreferenced(images);
        renderCache.evict(id);
    }

    /** Appends the screenshots after the existing pages, ordered by file name. */
    @Transactional
    public List<PageDto> addPages(long id, List<NamedImage> files) {
        Chapter c = structural(id);
        if (files == null || files.isEmpty()) {
            throw new InvalidMediaException("No files");
        }
        for (NamedImage f : files) {
            if (f.bytes().length > maxImageBytes) {
                throw new MediaTooLargeException();
            }
            ImageType type = sniffer.sniff(f.bytes())
                    .orElseThrow(() -> new InvalidMediaException("Not a PNG, JPEG or WebP image"));
            if (!PAGE_TYPES.contains(type)) {
                throw new InvalidMediaException("Not a PNG, JPEG or WebP image");
            }
        }
        List<NamedImage> sorted = new ArrayList<>(files);
        sorted.sort(Comparator.comparing(NamedImage::name, NaturalOrder.COMPARATOR));
        int position = (int) pages.countByChapterId(id);
        for (NamedImage f : sorted) {
            Media m = mediaService.store(f.name(), f.bytes());
            pages.save(new ChapterPage(c, ++position, m));
        }
        touch(c);
        return pageDtos(id);
    }

    @Transactional
    public List<PageDto> reorder(long id, PageOrderRequest request) {
        structural(id);
        List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(id);
        List<Long> order = request.pageIds() == null ? List.of() : request.pageIds();
        Map<Long, ChapterPage> byId = new HashMap<>();
        ps.forEach(p -> byId.put(p.getId(), p));
        if (order.size() != ps.size() || new HashSet<>(order).size() != order.size()
                || !byId.keySet().containsAll(order)) {
            throw new InvalidPageOrderException();
        }
        for (int i = 0; i < order.size(); i++) {
            byId.get(order.get(i)).setPosition(i + 1);
        }
        pages.flush();
        return pageDtos(id);
    }

    @Transactional
    public void deletePage(long id, long pageId) {
        Chapter c = structural(id);
        List<ChapterPage> ps = new ArrayList<>(pages.findByChapterIdOrderByPosition(id));
        ChapterPage target = ps.stream().filter(p -> p.getId() == pageId).findFirst()
                .orElseThrow(() -> new PageNotFoundException(pageId));
        ps.remove(target);
        pages.delete(target);
        for (int i = 0; i < ps.size(); i++) {
            ps.get(i).setPosition(i + 1);
        }
        touch(c);
        pages.flush();
        mediaService.deleteIfUnreferenced(List.of(target.getMedia().getId()));
    }

    /** Turns one page photo; its text stays. The photo is stored as a new file, the old one goes if no page uses it. */
    @Transactional
    public List<PageDto> rotatePage(long id, long pageId, RotateDirection direction) {
        Chapter c = structural(id);
        ChapterPage page = pages.findByChapterIdOrderByPosition(id).stream().filter(p -> p.getId() == pageId)
                .findFirst().orElseThrow(() -> new PageNotFoundException(pageId));
        Long oldId = rotateOne(page, direction);
        touch(c);
        pages.flush();
        mediaService.deleteIfUnreferenced(List.of(oldId));
        return pageDtos(id);
    }

    /** Turns every page photo of the chapter the same way. */
    @Transactional
    public List<PageDto> rotatePages(long id, RotateDirection direction) {
        Chapter c = structural(id);
        List<Long> old = new ArrayList<>();
        for (ChapterPage page : pages.findByChapterIdOrderByPosition(id)) {
            old.add(rotateOne(page, direction));
        }
        touch(c);
        pages.flush();
        mediaService.deleteIfUnreferenced(old);
        return pageDtos(id);
    }

    /** Stores the rotated photo as new media, points the page at it, and returns the old media id. */
    private Long rotateOne(ChapterPage page, RotateDirection direction) {
        Media old = page.getMedia();
        byte[] bytes = rotator.rotate(mediaService.load(old.getId()).path(), direction);
        page.setMedia(mediaService.store(old.getOriginalName(), bytes));
        return old.getId();
    }

    TranslatingModels models() {
        return models;
    }

    Chapter find(long id) {
        return chapters.findById(id).orElseThrow(() -> new ChapterNotFoundException(id));
    }

    /** The chapter, unless a translation is writing to it. */
    private Chapter editable(long id) {
        Chapter c = find(id);
        if (c.getTranslationStatus() == ChapterTranslationStatus.TRANSLATING) {
            throw new ChapterTranslationInProgressException(id);
        }
        return c;
    }

    /**
     * The chapter, when its pages may change: not while translating, and not once published (the notebook was built
     * from it; Unpublish first).
     */
    private Chapter structural(long id) {
        Chapter c = editable(id);
        if (c.hasSourceText()) {
            throw new ChapterTextSourceException(id);
        }
        if (c.getPublishStatus() == ChapterPublishStatus.PUBLISHED) {
            throw new ChapterPublishedException(id);
        }
        return c;
    }

    private void touch(Chapter c) {
        c.touch(clock.instant());
        c.getNovel().touch(clock.instant());
    }

    private static String validate(int chapterNo, String title) {
        List<FieldError> errors = new ArrayList<>();
        if (chapterNo < 1) {
            errors.add(new FieldError("chapterNo", "Use a chapter number of 1 or more."));
        }
        String t = title == null || title.isBlank() ? null : title.strip();
        if (t != null && t.length() > MAX_TITLE) {
            errors.add(new FieldError("title", "Use at most " + MAX_TITLE + " characters."));
        }
        if (!errors.isEmpty()) {
            throw new InvalidChapterException(errors);
        }
        return t;
    }

    private static final java.util.regex.Pattern DEFAULT_NAME =
            java.util.regex.Pattern.compile("(?iu)(?:chapter|chương)\\s+0*(\\d+)");

    /** Stripped; blank means no label, and so does the chapter's own default name ("Chapter 16" on chapter 16). */
    static String label(String label, int chapterNo) {
        String l = label.isBlank() ? null : label.strip();
        if (l != null && l.length() > MAX_LABEL) {
            throw new InvalidChapterException(
                    List.of(new FieldError("label", "Use at most " + MAX_LABEL + " characters.")));
        }
        if (l != null) {
            java.util.regex.Matcher m = DEFAULT_NAME.matcher(l);
            if (m.matches() && m.group(1).length() <= 9 && Integer.parseInt(m.group(1)) == chapterNo) {
                return null;
            }
        }
        return l;
    }

    private List<PageDto> pageDtos(long chapterId) {
        List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(chapterId);
        if (ps.isEmpty()) {
            return List.of();
        }
        Double median = SuspectPages.novelMedian(pages.findByChapterNovelId(ps.getFirst().getChapter().getNovel().getId()));
        return ps.stream()
                .map(p -> new PageDto(p.getId(), p.getPosition(), "/api/media/" + p.getMedia().getId(),
                        p.getTextVi(), p.getSourceTh(), landscape(p),
                        SuspectPages.suspect(p.getTextVi(), p.getSourceTh(), median)))
                .toList();
    }

    private boolean landscape(ChapterPage p) {
        try {
            return PageImageSize.landscape(mediaService.load(p.getMedia().getId()).path());
        } catch (RuntimeException e) {
            return false;
        }
    }

    ChapterDetail detail(Chapter c) {
        List<Chapter> all = chapters.findByNovelIdOrderBySortOrderAscChapterNoAsc(c.getNovel().getId());
        Long prev = null;
        Long next = null;
        for (int i = 0; i < all.size(); i++) {
            if (all.get(i).getId().equals(c.getId())) {
                prev = i > 0 ? all.get(i - 1).getId() : null;
                next = i < all.size() - 1 ? all.get(i + 1).getId() : null;
            }
        }
        return new ChapterDetail(c.getId(), c.getNovel().getId(), c.getNovel().getTitle(), c.getChapterNo(),
                c.getTitle(), c.getLabel(), c.getTranslationStatus(), c.getTranslationError(), models.shown(c), c.getTranslatedAt(),
                c.isEditedAfterTranslation(), c.getPublishStatus(), pageDtos(c.getId()),
                ChapterText.of(c, pages.findByChapterIdOrderByPosition(c.getId())), prev, next, c.getSourceText(),
                c.getWattpadPartId(), c.getSourceFetchedAt(), c.getNovel().getSourceLanguage());
    }
}
