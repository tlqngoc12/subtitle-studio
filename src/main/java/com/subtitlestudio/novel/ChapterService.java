package com.subtitlestudio.novel;

import com.subtitlestudio.config.GeminiSettings;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.novel.render.RenderCache;
import com.subtitlestudio.translate.GeminiCaller;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.ImageSniffer;
import com.subtitlestudio.profile.ImageType;
import com.subtitlestudio.profile.InvalidMediaException;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.profile.MediaTooLargeException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
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

    static final int MAX_TITLE = ChapterTitles.MAX_TITLE;
    private static final Set<ImageType> PAGE_TYPES = Set.of(ImageType.PNG, ImageType.JPEG, ImageType.WEBP);

    private final NovelRepository novels;
    private final ChapterRepository chapters;
    private final ChapterPageRepository pages;
    private final ChapterImageRepository chapterImages;
    private final MediaRepository mediaRepository;
    private final MediaService mediaService;
    private final ImageSniffer sniffer;
    private final RenderCache renderCache;
    private final PageRotator rotator;
    private final long maxImageBytes;
    private final Clock clock;
    private final TranslatingModels models;
    private final GeminiSettings gemini;
    private final ChapterReviewFiles reviewFiles;

    public ChapterService(NovelRepository novels, ChapterRepository chapters, ChapterPageRepository pages,
                          ChapterImageRepository chapterImages, MediaRepository mediaRepository,
                          MediaService mediaService, ImageSniffer sniffer, RenderCache renderCache,
                          PageRotator rotator, SubtitleStudioProperties properties, GeminiSettings gemini, Clock clock,
                          TranslatingModels models, ChapterReviewFiles reviewFiles) {
        this.reviewFiles = reviewFiles;
        this.novels = novels;
        this.chapters = chapters;
        this.pages = pages;
        this.chapterImages = chapterImages;
        this.mediaRepository = mediaRepository;
        this.mediaService = mediaService;
        this.sniffer = sniffer;
        this.renderCache = renderCache;
        this.rotator = rotator;
        this.maxImageBytes = properties.novel().maxPageImageSize().toBytes();
        this.gemini = gemini;
        this.clock = clock;
        this.models = models;
    }

    @Transactional
    public ChapterDetail add(long novelId, ChapterRequest request) {
        return detail(create(novelId, null, request == null ? null : request.title(), null));
    }

    /** Like {@link #add} with a chosen internal chapter number (tests build numbering gaps with it). */
    @Transactional
    ChapterDetail addNumbered(long novelId, int chapterNo, String title) {
        return detail(create(novelId, chapterNo, title, null));
    }

    /** Adds a DRAFT chapter at the end holding a Wattpad part's original text; returns its id. */
    @Transactional
    public long addFromSource(long novelId, String title, String sourceText, String wattpadPartId, Instant fetchedAt) {
        return addFromSource(novelId, title, sourceText, wattpadPartId, fetchedAt, List.of());
    }

    /**
     * Like the one above, for a text whose marker paragraphs refer to {@code images} (first appearance order, one per
     * distinct Wattpad URL); the chapter owns those media from now on.
     */
    @Transactional
    public long addFromSource(long novelId, String title, String sourceText, String wattpadPartId, Instant fetchedAt,
                              List<ChapterImageLink> images) {
        Chapter c = create(novelId, null, null, title);
        c.setSourceText(sourceText);
        c.setWattpadPartId(wattpadPartId);
        c.setSourceFetchedAt(fetchedAt);
        chapters.flush();
        syncImages(c, images);
        return c.getId();
    }

    /** The media id of each image the chapter already has, by the Wattpad URL it came from. */
    @Transactional(readOnly = true)
    public Map<String, Long> imageMediaByUrl(long id) {
        Map<String, Long> byUrl = new HashMap<>();
        chapterImages.findByChapterIdOrderByPosition(id)
                .forEach(i -> byUrl.put(i.getSourceUrl(), i.getMedia().getId()));
        return byUrl;
    }

    /**
     * Makes the chapter's image rows match {@code images}: new URLs are linked, URLs that are gone are unlinked (and
     * their media deleted once nothing else uses it), the others keep their row and take the new position.
     */
    private void syncImages(Chapter c, List<ChapterImageLink> images) {
        Map<String, ChapterImage> existing = new HashMap<>();
        for (ChapterImage i : chapterImages.findByChapterIdOrderByPosition(c.getId())) {
            existing.put(i.getSourceUrl(), i);
        }
        int position = 1;
        Set<String> kept = new HashSet<>();
        for (ChapterImageLink link : images) {
            if (!kept.add(link.sourceUrl())) {
                continue;
            }
            ChapterImage row = existing.get(link.sourceUrl());
            if (row != null && row.getMedia().getId() == link.mediaId()) {
                row.setPosition(position++);
                continue;
            }
            if (row != null) {
                chapterImages.delete(row);
                chapterImages.flush();
            }
            Media media = mediaRepository.findById(link.mediaId()).orElseThrow(() -> new InvalidChapterException(
                    List.of(new FieldError("images", "An image of this chapter was not found."))));
            chapterImages.save(new ChapterImage(c, media, link.sourceUrl(), position++));
        }
        List<ChapterImage> gone = existing.values().stream().filter(i -> !kept.contains(i.getSourceUrl())).toList();
        List<Long> goneMedia = gone.stream().map(i -> i.getMedia().getId()).toList();
        chapterImages.deleteAll(gone);
        chapterImages.flush();
        mediaService.deleteIfUnreferenced(goneMedia);
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

    /**
     * The Wattpad story id of an original story's chapter that may be synced from Wattpad: the story must have a
     * Wattpad link (else NovelNotWattpadException) and the chapter must be a Draft (else ChapterPublishedException).
     */
    @Transactional(readOnly = true)
    public String syncablePart(long id) {
        return syncable(find(id));
    }

    private static String syncable(Chapter c) {
        Novel n = c.getNovel();
        if (n.getSourceType() != NovelSourceType.ORIGINAL || n.getWattpadStoryId() == null) {
            throw new NovelNotWattpadException(n.getId());
        }
        if (c.getPublishStatus() == ChapterPublishStatus.PUBLISHED) {
            throw new ChapterPublishedException(c.getId());
        }
        return n.getWattpadStoryId();
    }

    /**
     * Adds a Draft chapter at the end of an original story holding the text of a Wattpad part, and records the sync
     * like {@link #replaceOriginalText}. The title is the part's name; when that cannot be a title (too long, no
     * letters or digits, or its name is already used by another chapter) it becomes {@code Chương N: <name>}.
     * Returns the new chapter's id.
     */
    @Transactional
    public long addOriginalFromSync(long novelId, String partName, String text, String partId,
                                    Instant wattpadModifiedAt) {
        List<Chapter> existing = chapters.findByNovelIdOrderByChapterNo(novelId);
        String name = partName == null ? "" : partName.strip();
        java.util.Optional<String> key = ChapterTitles.reviewKey(name);
        boolean usable = !name.isEmpty() && name.length() <= MAX_TITLE && key.isPresent()
                && existing.stream().noneMatch(o -> ChapterTitles.reviewKey(o.getTitle()).filter(key.get()::equals).isPresent());
        Chapter c = create(novelId, null, usable ? name : null, usable ? null : name);
        c.setTextVi(text == null || text.isBlank() ? null : text);
        c.setSourceFetchedAt(clock.instant());
        c.setOriginalWattpadPartId(partId);
        c.setWattpadSyncedHash(ChapterSyncHash.of(c.getTextVi()));
        c.setWattpadModifiedAt(wattpadModifiedAt);
        return c.getId();
    }

    /**
     * The chapters of an original story in reading order, as the Wattpad sync sees them. Only a chapter that has been
     * synced (has a part id) gets the hash of its current text.
     */
    @Transactional(readOnly = true)
    public List<OriginalChapterState> originalStates(long novelId) {
        return chapters.findByNovelIdOrderBySortOrderAscChapterNoAsc(novelId).stream()
                .map(c -> new OriginalChapterState(c.getId(), c.getTitle(),
                        c.getPublishStatus() == ChapterPublishStatus.PUBLISHED, c.getOriginalWattpadPartId(),
                        c.getSourceFetchedAt(), c.getWattpadSyncedHash(),
                        c.getOriginalWattpadPartId() == null ? null : ChapterSyncHash.of(c.getTextVi())))
                .toList();
    }

    /**
     * Replaces the whole text of a Draft chapter of a linked original story (after a sync from Wattpad) and records
     * the sync: the part it came from (taken off another chapter of the novel that held it), the hash of the stored
     * text, the part's modification date on Wattpad and when it happened. The title, status and everything else stay;
     * the length is limited like a hand edit (the text column is unbounded).
     */
    @Transactional
    public ChapterDetail replaceOriginalText(long id, String text, String partId, Instant wattpadModifiedAt) {
        Chapter c = editable(id);
        syncable(c);
        if (partId != null) {
            for (Chapter other : chapters.findByNovelIdAndOriginalWattpadPartId(c.getNovel().getId(), partId)) {
                if (!other.getId().equals(c.getId())) {
                    other.setOriginalWattpadPartId(null);
                    chapters.flush();
                }
            }
        }
        c.setTextVi(text == null || text.isBlank() ? null : text);
        c.setSourceFetchedAt(clock.instant());
        c.setOriginalWattpadPartId(partId);
        c.setWattpadSyncedHash(ChapterSyncHash.of(c.getTextVi()));
        c.setWattpadModifiedAt(wattpadModifiedAt);
        touch(c);
        return detail(c);
    }

    /** Replaces the original text of a Draft Wattpad chapter; the translation is not touched. */
    @Transactional
    public ChapterDetail replaceSourceText(long id, String sourceText, Instant fetchedAt) {
        return replaceSourceText(id, sourceText, fetchedAt, null);
    }

    /**
     * Like the one above, and the chapter's images become {@code images} (null leaves the images as they are, an empty
     * list unlinks them all).
     */
    @Transactional
    public ChapterDetail replaceSourceText(long id, String sourceText, Instant fetchedAt,
                                           List<ChapterImageLink> images) {
        reloadablePartId(id);
        Chapter c = find(id);
        c.setSourceText(sourceText);
        c.setSourceFetchedAt(fetchedAt);
        touch(c);
        if (images != null) {
            syncImages(c, images);
        }
        return detail(c);
    }

    /**
     * A new chapter at the end. The number is internal: the highest + 1 unless {@code chapterNo} is given. A blank
     * {@code title} becomes {@code Chương N}, followed by {@code partName} (a Wattpad part's name) when there is one.
     */
    private Chapter create(long novelId, Integer chapterNo, String title, String partName) {
        Novel novel = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
        List<Chapter> existing = chapters.findByNovelIdOrderByChapterNo(novelId);
        int no = chapterNo != null ? chapterNo
                : existing.isEmpty() ? 1 : existing.getLast().getChapterNo() + 1;
        if (no < 1) {
            throw new InvalidChapterException(List.of(new FieldError("chapterNo", "Use a chapter number of 1 or more.")));
        }
        if (existing.stream().anyMatch(c -> c.getChapterNo() == no)) {
            throw new DuplicateChapterNumberException(no);
        }
        String given = title == null || title.isBlank() ? null : title.strip();
        String shown = given != null ? given
                : ChapterTitles.defaultTitle(existing.stream().map(Chapter::getTitle).toList(), partName);
        shown = validateTitle(existing, null, shown);
        novel.touch(clock.instant());
        Chapter created = new Chapter(novel, no, shown, clock.instant());
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

    private static boolean hasProfile(Novel novel) {
        return novel.getPromptProfile() != null && !novel.getPromptProfile().isBlank();
    }

    /** The newest review file of a chapter of an original story (404 when there is none). */
    @Transactional(readOnly = true)
    public ChapterReview review(long chapterId) {
        Chapter c = find(chapterId);
        Novel novel = c.getNovel();
        if (!hasProfile(novel)) {
            throw new ChapterReviewNotFoundException(null);
        }
        String profile = novel.getPromptProfile();
        String key = ChapterTitles.reviewKey(c.getTitle()).orElse("");
        Path file = reviewFiles.newest(profile, key)
                .orElseThrow(() -> new ChapterReviewNotFoundException(ChapterReviewFiles.pattern(profile, key)));
        try {
            return new ChapterReview(file.getFileName().toString(), Files.readString(file, StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new ChapterReviewNotFoundException(ChapterReviewFiles.pattern(profile, key));
        }
    }

    @Transactional(readOnly = true)
    public ChapterDetail get(long id) {
        return detail(find(id));
    }

    @Transactional
    public ChapterDetail update(long id, ChapterUpdateRequest request) {
        Chapter c = editable(id);
        if (request.title() != null) {
            List<Chapter> all = chapters.findByNovelIdOrderByChapterNo(c.getNovel().getId());
            String oldKey = ChapterTitles.reviewKey(c.getTitle()).orElse(null);
            c.setTitle(validateTitle(all, c.getId(), request.title()));
            String newKey = ChapterTitles.reviewKey(c.getTitle()).orElse(null);
            if (hasProfile(c.getNovel()) && oldKey != null && !oldKey.equals(newKey)) {
                reviewFiles.rename(c.getNovel().getPromptProfile(), oldKey, newKey);
            }
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
                requireSameImageMarkers(c, text);
                c.setTextVi(text);
                textChanged = true;
            }
        }
        if (textChanged) {
            c.setEditedAfterTranslation(true);
            if (c.getTranslationStatus() == ChapterTranslationStatus.FAILED
                    && ChapterText.complete(c, pages.findByChapterIdOrderByPosition(id))) {
                // the text was written by hand: the failed Gemini run no longer matters
                c.setTranslationStatus(ChapterTranslationStatus.TRANSLATED);
                c.setTranslationError(null);
            }
        }
        touch(c);
        return detail(c);
    }

    /**
     * A chapter with images may lose or move marker lines but not gain or change any: the marker ids of the new text
     * must be a subset of those the chapter owns (the original's, else its image rows'), each at most once. The image
     * rows stay, so a removed line does not delete the media. A chapter without images is not checked.
     */
    private void requireSameImageMarkers(Chapter c, String newText) {
        List<Long> owned = ImageMarkers.ids(c.getSourceText());
        if (owned.isEmpty()) {
            owned = chapterImages.findByChapterIdOrderByPosition(c.getId()).stream()
                    .map(i -> i.getMedia().getId()).toList();
        }
        if (owned.isEmpty()) {
            return;
        }
        if (!ImageMarkers.isSubMultiset(owned, ImageMarkers.ids(newText))) {
            throw new ChapterImageMarkersException();
        }
    }

    @Transactional
    public void delete(long id) {
        Chapter c = editable(id);
        long novelId = c.getNovel().getId();
        String profile = c.getNovel().getPromptProfile();
        String key = ChapterTitles.reviewKey(c.getTitle()).orElse(null);
        List<ChapterPage> ps = pages.findByChapterIdOrderByPosition(id);
        List<Long> images = new ArrayList<>(ps.stream().map(p -> p.getMedia().getId()).toList());
        pages.deleteAll(ps);
        List<ChapterImage> inText = chapterImages.findByChapterIdOrderByPosition(id);
        inText.forEach(i -> images.add(i.getMedia().getId()));
        chapterImages.deleteAll(inText);
        c.getNovel().touch(clock.instant());
        chapters.delete(c);
        chapters.flush();
        mediaService.deleteIfUnreferenced(images);
        renderCache.evict(id);
        if (profile != null && !profile.isBlank() && key != null) {
            reviewFiles.archive(profile, key);
        }
    }

    /** Enough of the start of a file to recognise PNG, JPEG, GIF and WebP. */
    private static final int SNIFF_BYTES = 32;

    /**
     * Appends the screenshots after the existing pages, ordered by file name. Files are checked by size and first
     * bytes, then read one at a time while they are stored, so only one image is in memory at once.
     */
    @Transactional
    public List<PageDto> addPages(long id, List<NamedImage> files) {
        Chapter c = structural(id);
        if (files == null || files.isEmpty()) {
            throw new InvalidMediaException("No files");
        }
        for (NamedImage f : files) {
            if (f.size() > maxImageBytes) {
                throw new MediaTooLargeException();
            }
            ImageType type = sniffer.sniff(f.head(SNIFF_BYTES))
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
     * The chapter, when its pages may change: not while translating, and not once published (Unpublish first).
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

    /**
     * The stripped title, which must be filled, fit the column, give a review key and not share that key with another
     * chapter of the novel ({@code others} may contain the chapter itself: it is skipped by {@code selfId}).
     */
    private static String validateTitle(List<Chapter> others, Long selfId, String title) {
        String t = title == null ? "" : title.strip();
        if (t.isEmpty()) {
            throw titleError("Enter a chapter title.");
        }
        if (t.length() > MAX_TITLE) {
            throw titleError("Use at most " + MAX_TITLE + " characters.");
        }
        String key = ChapterTitles.reviewKey(t)
                .orElseThrow(() -> titleError("Use letters or digits in the chapter name."));
        for (Chapter o : others) {
            if (!Objects.equals(o.getId(), selfId) && ChapterTitles.reviewKey(o.getTitle()).filter(key::equals).isPresent()) {
                throw titleError("Another chapter of this novel already uses the name \"" + key + "\".");
            }
        }
        return t;
    }

    private static InvalidChapterException titleError(String message) {
        return new InvalidChapterException(List.of(new FieldError("title", message)));
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
        String shownModel = models.shown(c);
        return new ChapterDetail(c.getId(), c.getNovel().getId(), c.getNovel().getTitle(), c.getChapterNo(),
                c.getTitle(), c.getTranslationStatus(), c.getTranslationError(), shownModel, c.getTranslatedAt(),
                c.isEditedAfterTranslation(), c.getPublishStatus(), pageDtos(c.getId()),
                ChapterText.of(c, pages.findByChapterIdOrderByPosition(c.getId())), prev, next, c.getSourceText(),
                c.getWattpadPartId(), c.getSourceFetchedAt(), c.getNovel().getSourceLanguage())
                .withSourceType(c.getNovel().getSourceType())
                .withOriginalWattpadPartId(c.getOriginalWattpadPartId())
                .withWattpadLinked(c.getNovel().getSourceType() == NovelSourceType.ORIGINAL
                        && c.getNovel().getWattpadStoryId() != null)
                .withTranslatedByFallback(GeminiCaller.translatedByFallback(shownModel, gemini.current().model()));
    }
}
