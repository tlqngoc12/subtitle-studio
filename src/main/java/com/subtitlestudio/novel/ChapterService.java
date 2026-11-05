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
    private static final Set<ImageType> PAGE_TYPES = Set.of(ImageType.PNG, ImageType.JPEG, ImageType.WEBP);

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final MediaService mediaService;
    private final ImageSniffer sniffer;
    private final NotebookScheduler notebook;
    private final RenderCache renderCache;
    private final long maxImageBytes;
    private final Clock clock;

    public ChapterService(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                          MediaService mediaService, ImageSniffer sniffer, NotebookScheduler notebook,
                          RenderCache renderCache, SubtitleStudioProperties properties, Clock clock) {
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.mediaService = mediaService;
        this.sniffer = sniffer;
        this.notebook = notebook;
        this.renderCache = renderCache;
        this.maxImageBytes = properties.novel().maxPageImageSize().toBytes();
        this.clock = clock;
    }

    @Transactional
    public ChapterDetail add(long novelId, ChapterRequest request) {
        Novel novel = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
        List<Chapter> existing = chapters.findByNovelIdOrderByChapterNo(novelId);
        int no = request.chapterNo() != null ? request.chapterNo()
                : existing.isEmpty() ? 1 : existing.getLast().getChapterNo() + 1;
        String title = validate(no, request.title());
        if (existing.stream().anyMatch(c -> c.getChapterNo() == no)) {
            throw new DuplicateChapterNumberException(no);
        }
        novel.touch(clock.instant());
        return detail(chapters.save(new Chapter(novel, no, title, clock.instant())));
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
        boolean textChanged = false;
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
        if (textChanged && c.getPublishStatus() == ChapterPublishStatus.PUBLISHED) {
            notebook.scheduleUpdate(c.getNovel().getId(), c.getChapterNo());
        }
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

    private List<PageDto> pageDtos(long chapterId) {
        return pages.findByChapterIdOrderByPosition(chapterId).stream()
                .map(p -> new PageDto(p.getId(), p.getPosition(), "/api/media/" + p.getMedia().getId(),
                        p.getTextVi()))
                .toList();
    }

    ChapterDetail detail(Chapter c) {
        List<Chapter> all = chapters.findByNovelIdOrderByChapterNo(c.getNovel().getId());
        Long prev = null;
        Long next = null;
        for (int i = 0; i < all.size(); i++) {
            if (all.get(i).getId().equals(c.getId())) {
                prev = i > 0 ? all.get(i - 1).getId() : null;
                next = i < all.size() - 1 ? all.get(i + 1).getId() : null;
            }
        }
        return new ChapterDetail(c.getId(), c.getNovel().getId(), c.getNovel().getTitle(), c.getChapterNo(),
                c.getTitle(), c.getTranslationStatus(), c.getTranslationError(), c.getTranslatedAt(),
                c.isEditedAfterTranslation(), c.getPublishStatus(), pageDtos(c.getId()),
                ChapterText.of(c, pages.findByChapterIdOrderByPosition(c.getId())), prev, next);
    }
}
