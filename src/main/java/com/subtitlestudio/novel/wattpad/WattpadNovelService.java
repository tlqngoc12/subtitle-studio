package com.subtitlestudio.novel.wattpad;

import com.subtitlestudio.fanfic.FanficService;
import com.subtitlestudio.fanfic.InvalidFanficLinkException;
import com.subtitlestudio.fanfic.WattpadClient;
import com.subtitlestudio.fanfic.WattpadLink;
import com.subtitlestudio.fanfic.WattpadStory;
import com.subtitlestudio.fanfic.WattpadStoryParts;
import com.subtitlestudio.fanfic.Sleeper;
import com.subtitlestudio.fanfic.WattpadPart;
import com.subtitlestudio.fanfic.WattpadUnavailableException;
import com.subtitlestudio.novel.ChapterDetail;
import com.subtitlestudio.novel.ChapterImageLink;
import com.subtitlestudio.novel.ChapterRepository;
import com.subtitlestudio.novel.ImageMarkers;
import com.subtitlestudio.novel.Chapter;
import com.subtitlestudio.novel.ChapterAlreadyTranslatedException;
import com.subtitlestudio.novel.ChapterService;
import com.subtitlestudio.novel.ChapterTranslationService;
import com.subtitlestudio.novel.ChapterTranslationStatus;
import com.subtitlestudio.novel.NovelTranslationBusyException;
import com.subtitlestudio.novel.DuplicateWattpadNovelException;
import com.subtitlestudio.novel.NovelNotFoundException;
import com.subtitlestudio.novel.NovelNotWattpadException;
import com.subtitlestudio.novel.NovelProfileNames;
import com.subtitlestudio.novel.NovelProfileStore;
import com.subtitlestudio.novel.NovelProfileTemplate;
import com.subtitlestudio.novel.NovelSourceType;
import com.subtitlestudio.novel.InvalidNovelException;
import com.subtitlestudio.novel.Novel;
import com.subtitlestudio.novel.NovelDetail;
import com.subtitlestudio.novel.NovelRepository;
import com.subtitlestudio.novel.NovelRequest;
import com.subtitlestudio.novel.NovelService;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaService;
import java.net.URI;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Everything Wattpad-specific about creating a novel: the preview that prefills the New novel form, and the create that
 * also fetches the cover. Wattpad is never called inside a database transaction. The novel itself is an ordinary novel
 * created by {@link NovelService}.
 */
@Service
public class WattpadNovelService {

    private static final Logger log = LoggerFactory.getLogger(WattpadNovelService.class);
    private static final int COVER_SIDE = 512;
    static final int PAUSE_BETWEEN_PARTS_MS = 500;
    static final String NO_TEXT = "Wattpad has no text for this part (locked, empty or removed).";
    static final String IMAGES_FAILED = "Wattpad images for this part could not be downloaded.";
    static final String DID_NOT_ANSWER = "Wattpad did not answer. Try again later.";

    private final WattpadClient wattpad;
    private final NovelRepository novels;
    private final NovelService novelService;
    private final MediaService mediaService;
    private final ChapterRepository chapters;
    private final ChapterService chapterService;
    private final ChapterTranslationService translation;
    private final NovelProfileStore profiles;
    private final Sleeper sleeper;
    private final Clock clock;

    public WattpadNovelService(WattpadClient wattpad, NovelRepository novels, NovelService novelService,
                               MediaService mediaService, ChapterRepository chapters, ChapterService chapterService,
                               ChapterTranslationService translation, NovelProfileStore profiles,
                               Sleeper sleeper, Clock clock) {
        this.profiles = profiles;
        this.translation = translation;
        this.chapters = chapters;
        this.chapterService = chapterService;
        this.sleeper = sleeper;
        this.clock = clock;
        this.wattpad = wattpad;
        this.novels = novels;
        this.novelService = novelService;
        this.mediaService = mediaService;
    }

    /** Reads the story from Wattpad and builds the prefill; nothing is saved. */
    public WattpadNovelPreview preview(String link) {
        String storyId = storyId(link);
        WattpadStoryParts parts = wattpad.storyWithParts(storyId);
        WattpadStory s = parts.story();
        Long existing = novels.findByWattpadStoryId(storyId).map(Novel::getId).orElse(null);
        return new WattpadNovelPreview(storyId, s.title(), s.author(), s.description(), s.tags(), s.completed(),
                parts.languageName(), guessLanguage(parts.languageName()), s.partCount(), s.coverUrl(),
                WattpadLink.canonicalUrl(storyId), existing,
                parts.parts().stream().map(p -> new WattpadPreviewPart(p.id(), p.title(), p.wordCount(),
                        p.modifiedAt(), p.deleted())).toList(),
                NovelProfileNames.fromTitle(s.title(), storyId, profiles::exists));
    }

    /** Creates the novel; the story cover is downloaded first (a cover that fails never blocks the novel). */
    public NovelDetail create(NovelRequest request) {
        String storyId = request.wattpadStoryId() == null ? null : request.wattpadStoryId().strip();
        if (storyId != null) {
            novels.findByWattpadStoryId(storyId).ifPresent(existing -> {
                throw new DuplicateWattpadNovelException(existing.getTitle(), existing.getId());
            });
        }
        NovelRequest toCreate = request;
        Media cover = null;
        if (request.coverUrl() != null && !request.coverUrl().isBlank() && request.coverMediaId() == null) {
            String coverUrl = request.coverUrl().strip();
            requireWattpadImageHost(coverUrl);
            cover = downloadCover(coverUrl);
            if (cover != null) {
                toCreate = withCover(request, cover.getId());
            }
        }
        String createdProfile = null;
        try {
            if (storyId != null && (request.promptProfile() == null || request.promptProfile().isBlank())) {
                String name = NovelProfileNames.fromTitle(request.title(), storyId, profiles::exists);
                profiles.create(name, NovelProfileTemplate.render(request.sourceLanguage(), request.title(),
                        request.originalAuthor(), request.tags(), request.description()));
                createdProfile = name;
                toCreate = withProfile(toCreate, name);
            }
            return novelService.create(toCreate);
        } catch (RuntimeException e) {
            if (createdProfile != null) {
                profiles.delete(createdProfile);
            }
            if (cover != null) {
                mediaService.deleteIfUnreferenced(List.of(cover.getId()));
            }
            throw e;
        }
    }

    /** The story's parts in story order, each with the chapter it was imported as (if any). */
    public List<WattpadPartRow> parts(long novelId) {
        String storyId = linkedStory(novelId).getWattpadStoryId();
        List<WattpadPart> parts = wattpad.storyWithParts(storyId).parts();
        Map<String, Long> imported = importedParts(novelId);
        return parts.stream().map(p -> new WattpadPartRow(p.id(), p.title(), p.wordCount(), p.createdAt(),
                p.modifiedAt(), p.deleted(), imported.get(p.id()))).toList();
    }

    /**
     * Imports the chosen parts, in story order, as Draft chapters at the end of the novel. A part that is already a
     * chapter is skipped; a part that fails is reported and the others go on. Wattpad is called outside any
     * transaction, with a short pause between parts.
     */
    public WattpadImportResult importParts(long novelId, List<String> partIds) {
        String storyId = wattpadStoryOf(novelId);
        Set<String> wanted = partIds == null ? Set.of() : new HashSet<>(partIds);
        List<WattpadPart> parts = wattpad.storyWithParts(storyId).parts();
        Map<String, Long> already = importedParts(novelId);
        List<WattpadImportResult.Imported> imported = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        List<WattpadImportResult.Failure> failed = new ArrayList<>();
        Set<String> known = new HashSet<>();
        boolean fetchedBefore = false;
        for (WattpadPart part : parts) {
            known.add(part.id());
            if (!wanted.contains(part.id())) {
                continue;
            }
            if (already.containsKey(part.id())) {
                skipped.add(part.id());
                continue;
            }
            if (part.deleted()) {
                failed.add(new WattpadImportResult.Failure(part.id(), part.title(), "This part was deleted on Wattpad."));
                continue;
            }
            if (fetchedBefore) {
                sleeper.sleep(PAUSE_BETWEEN_PARTS_MS);
            }
            fetchedBefore = true;
            PreparedText prepared = null;
            try {
                prepared = prepare(part.id(), wattpad.partText(part.id()), Map.of());
                if (prepared.text().isEmpty()) {
                    failed.add(new WattpadImportResult.Failure(part.id(), part.title(),
                            prepared.allImagesFailed() ? IMAGES_FAILED : NO_TEXT));
                    continue;
                }
                long chapterId = prepared.links().isEmpty()
                        ? chapterService.addFromSource(novelId, part.title(), prepared.text(), part.id(), clock.instant())
                        : chapterService.addFromSource(novelId, part.title(), prepared.text(), part.id(),
                                clock.instant(), prepared.links());
                imported.add(new WattpadImportResult.Imported(part.id(), chapterId, prepared.skipped()));
            } catch (WattpadUnavailableException e) {
                discard(prepared);
                failed.add(new WattpadImportResult.Failure(part.id(), part.title(), DID_NOT_ANSWER));
            } catch (RuntimeException e) {
                discard(prepared);
                log.warn("Could not import Wattpad part {}: {}", part.id(), e.toString());
                failed.add(new WattpadImportResult.Failure(part.id(), part.title(), "Could not save this part."));
            }
        }
        for (String id : wanted) {
            if (!known.contains(id)) {
                failed.add(new WattpadImportResult.Failure(id, id, "This part is not in the story."));
            }
        }
        return new WattpadImportResult(imported, skipped, failed);
    }

    /** Fetches the part again and replaces the chapter's original text (Draft chapters only). */
    public ChapterDetail reloadOriginal(long chapterId) {
        String partId = chapterService.reloadablePartId(chapterId);
        Map<String, Long> known = chapterService.imageMediaByUrl(chapterId);
        PreparedText prepared = prepare(partId, wattpad.partText(partId), known);
        if (prepared.text().isEmpty()) {
            if (prepared.allImagesFailed()) {
                throw new WattpadPartProblemException(WattpadPartProblemException.IMAGES_FAILED, IMAGES_FAILED);
            }
            throw new WattpadUnavailableException("Wattpad has no text for part " + partId);
        }
        try {
            ChapterDetail reloaded = prepared.links().isEmpty() && known.isEmpty()
                    ? chapterService.replaceSourceText(chapterId, prepared.text(), clock.instant())
                    : chapterService.replaceSourceText(chapterId, prepared.text(), clock.instant(), prepared.links());
            return withSkipped(reloaded, prepared.skipped());
        } catch (RuntimeException e) {
            discard(prepared);
            throw e;
        }
    }

    /**
     * Replaces the text of a Draft chapter of a linked original story with the text of one Wattpad part. The title
     * stays, images are dropped (never downloaded). Wattpad is called outside any transaction, and the chapter is
     * only written once everything has been fetched.
     */
    public ChapterDetail syncOriginal(long chapterId, String partId) {
        String storyId = chapterService.syncablePart(chapterId);
        WattpadPart part = wattpad.storyWithParts(storyId).parts().stream()
                .filter(p -> p.id().equals(partId)).findFirst().orElseThrow(() -> new WattpadPartProblemException(
                        WattpadPartProblemException.NOT_FOUND, "This part is not in the story."));
        if (part.deleted()) {
            throw new WattpadPartProblemException(WattpadPartProblemException.DELETED,
                    "This part was deleted on Wattpad.");
        }
        WattpadText.Parsed parsed = WattpadText.parse(wattpad.partText(partId));
        String text = parsed.text().isEmpty() ? "" : java.util.Arrays.stream(parsed.text().split("\n\n"))
                .filter(paragraph -> WattpadText.placeholderIndex(paragraph) < 0)
                .collect(java.util.stream.Collectors.joining("\n\n"));
        if (text.isBlank()) {
            throw new WattpadPartProblemException(WattpadPartProblemException.EMPTY, NO_TEXT);
        }
        ChapterDetail synced = chapterService.replaceOriginalText(chapterId, text);
        log.info("Synced chapter {} from Wattpad part {} ({} characters)", chapterId, partId, text.length());
        return synced;
    }

    /** The original text of a part with its images stored: markers in place of the images, links to own them. */
    private record PreparedText(String text, List<ChapterImageLink> links, int skipped, boolean allImagesFailed,
                                List<Long> newMedia) {
    }

    /**
     * Downloads and stores the images of a part's HTML and replaces each image placeholder by its marker paragraph. An
     * image the chapter already has (same URL) keeps its media, so markers of an existing translation stay valid. An
     * image that cannot be downloaded (or is not on a Wattpad image host, which is never contacted) is dropped and
     * counted. Wattpad is called here, so never inside a transaction.
     */
    private PreparedText prepare(String partId, String html, Map<String, Long> known) {
        WattpadText.Parsed parsed = WattpadText.parse(html);
        List<String> urls = parsed.imageUrls();
        Long[] mediaOf = new Long[urls.size()];
        Map<String, Long> byUrl = new HashMap<>();
        List<Long> created = new ArrayList<>();
        Set<String> failedUrls = new HashSet<>();
        for (int i = 0; i < urls.size(); i++) {
            String url = urls.get(i);
            Long id = byUrl.get(url);
            if (id == null && !failedUrls.contains(url)) {
                id = known.get(url);
                if (id == null) {
                    Media stored = downloadChapterImage(partId, url);
                    if (stored != null) {
                        id = stored.getId();
                        created.add(id);
                    }
                }
                if (id == null) {
                    failedUrls.add(url);
                } else {
                    byUrl.put(url, id);
                }
            }
            mediaOf[i] = id;
        }
        List<String> paragraphs = new ArrayList<>();
        List<ChapterImageLink> links = new ArrayList<>();
        Set<String> linked = new HashSet<>();
        int skipped = 0;
        for (String paragraph : parsed.text().isEmpty() ? new String[0] : parsed.text().split("\n\n")) {
            int index = WattpadText.placeholderIndex(paragraph);
            if (index < 0 || index >= mediaOf.length) {
                paragraphs.add(paragraph);
            } else if (mediaOf[index] == null) {
                skipped++;
            } else {
                paragraphs.add(ImageMarkers.marker(mediaOf[index]));
                if (linked.add(urls.get(index))) {
                    links.add(new ChapterImageLink(mediaOf[index], urls.get(index)));
                }
            }
        }
        if (skipped > 0) {
            log.warn("Wattpad part {}: {} image(s) could not be downloaded", partId, skipped);
        }
        String text = String.join("\n\n", paragraphs);
        boolean allFailed = !urls.isEmpty() && links.isEmpty() && text.isEmpty();
        return new PreparedText(text, links, skipped, allFailed, created);
    }

    private Media downloadChapterImage(String partId, String url) {
        if (!isWattpadImageHost(url)) {
            log.warn("Wattpad part {}: image skipped, not a Wattpad image host", partId);
            return null;
        }
        try {
            return mediaService.store("wattpad-image", wattpad.downloadImage(url, MediaService.MAX_BYTES));
        } catch (RuntimeException e) {
            log.warn("Wattpad part {}: could not store an image: {}", partId, e.toString());
            return null;
        }
    }

    private static ChapterDetail withSkipped(ChapterDetail detail, int skipped) {
        return skipped > 0 ? detail.withSkippedImages(skipped) : detail;
    }

    /** Removes the images stored for a chapter that was not saved. */
    private void discard(PreparedText prepared) {
        if (prepared != null && !prepared.newMedia().isEmpty()) {
            try {
                mediaService.deleteIfUnreferenced(prepared.newMedia());
            } catch (RuntimeException e) {
                log.warn("Could not remove images of an unsaved Wattpad chapter: {}", e.toString());
            }
        }
    }

    /**
     * Fetches one part (unless it is already a chapter) and starts translating it, one chapter at a time per novel.
     * Not transactional: Wattpad is called outside any transaction. When starting the translation fails the saved
     * chapter is kept (status NONE) so a retry only translates.
     */
    public ChapterDetail fetchAndTranslate(long novelId, String partId) {
        Novel novel = readyWattpadNovel(novelId);
        Chapter existing = chapters.findByNovelIdAndWattpadPartId(novelId, partId).orElse(null);
        if (existing != null) {
            if (existing.getTranslationStatus() == ChapterTranslationStatus.TRANSLATED) {
                throw new ChapterAlreadyTranslatedException(existing.getId());
            }
            return translation.start(existing.getId());
        }
        WattpadPart part = wattpad.storyWithParts(novel.getWattpadStoryId()).parts().stream()
                .filter(p -> p.id().equals(partId)).findFirst().orElseThrow(() -> new WattpadPartProblemException(
                        WattpadPartProblemException.NOT_FOUND, "This part is not in the story."));
        if (part.deleted()) {
            throw new WattpadPartProblemException(WattpadPartProblemException.DELETED,
                    "This part was deleted on Wattpad.");
        }
        return fetchAndStart(novelId, part);
    }

    /**
     * Starts the next part: the first, in Wattpad order, that is not deleted and whose chapter is missing or not yet
     * translated (NONE/FAILED), the same rule as the Next badge of the Wattpad tab. Calls Wattpad once for the part
     * list, and once more for the text when the part is new; never inside a transaction.
     *
     * @throws WattpadNothingNextException when every part is deleted or translated (nothing is created)
     */
    public ChapterDetail fetchAndTranslateNext(long novelId) {
        Novel novel = readyWattpadNovel(novelId);
        for (WattpadPart part : wattpad.storyWithParts(novel.getWattpadStoryId()).parts()) {
            if (part.deleted()) {
                continue;
            }
            Chapter existing = chapters.findByNovelIdAndWattpadPartId(novelId, part.id()).orElse(null);
            if (existing == null) {
                return fetchAndStart(novelId, part);
            }
            if (existing.getTranslationStatus() != ChapterTranslationStatus.TRANSLATED) {
                return translation.start(existing.getId());
            }
        }
        throw new WattpadNothingNextException();
    }

    /** The novel, after the one-chapter-at-a-time and Gemini/profile checks, before Wattpad is called. */
    private Novel readyWattpadNovel(long novelId) {
        Novel novel = wattpadNovel(novelId);
        Chapter translating = chapters
                .findFirstByNovelIdAndTranslationStatusOrderByChapterNo(novelId, ChapterTranslationStatus.TRANSLATING)
                .orElse(null);
        if (translating != null) {
            throw new NovelTranslationBusyException(novelId, NovelTranslationBusyException.Reason.CHAPTER_TRANSLATING,
                    translating.getChapterNo(), translating.getTitle());
        }
        translation.requireReady(novel);
        return novel;
    }

    /** Fetches a part that is not a chapter yet, saves it as one and starts translating it. */
    private ChapterDetail fetchAndStart(long novelId, WattpadPart part) {
        PreparedText prepared = prepare(part.id(), wattpad.partText(part.id()), Map.of());
        if (prepared.text().isEmpty()) {
            if (prepared.allImagesFailed()) {
                throw new WattpadPartProblemException(WattpadPartProblemException.IMAGES_FAILED, IMAGES_FAILED);
            }
            throw new WattpadPartProblemException(WattpadPartProblemException.EMPTY, NO_TEXT);
        }
        long chapterId;
        try {
            chapterId = prepared.links().isEmpty()
                    ? chapterService.addFromSource(novelId, part.title(), prepared.text(), part.id(), clock.instant())
                    : chapterService.addFromSource(novelId, part.title(), prepared.text(), part.id(), clock.instant(),
                            prepared.links());
        } catch (RuntimeException e) {
            discard(prepared);
            throw e;
        }
        return withSkipped(translation.start(chapterId), prepared.skipped());
    }

    private String wattpadStoryOf(long novelId) {
        return wattpadNovel(novelId).getWattpadStoryId();
    }

    private Novel wattpadNovel(long novelId) {
        Novel n = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
        if (n.getSourceType() != NovelSourceType.WATTPAD || n.getWattpadStoryId() == null) {
            throw new NovelNotWattpadException(novelId);
        }
        return n;
    }

    /** A Wattpad novel, or an original story that has a Wattpad link: the ones whose parts may be listed. */
    private Novel linkedStory(long novelId) {
        Novel n = novels.findById(novelId).orElseThrow(() -> new NovelNotFoundException(novelId));
        boolean linkable = n.getSourceType() == NovelSourceType.WATTPAD || n.getSourceType() == NovelSourceType.ORIGINAL;
        if (!linkable || n.getWattpadStoryId() == null) {
            throw new NovelNotWattpadException(novelId);
        }
        return n;
    }

    private Map<String, Long> importedParts(long novelId) {
        Map<String, Long> map = new HashMap<>();
        for (Object[] row : chapters.importedParts(novelId)) {
            map.put((String) row[0], ((Number) row[1]).longValue());
        }
        return map;
    }

    static String guessLanguage(String languageName) {
        String name = languageName == null ? "" : languageName.strip().toLowerCase(Locale.ROOT);
        if (name.startsWith("thai")) return "th";
        if (name.startsWith("español") || name.startsWith("espanol") || name.startsWith("spanish")) return "es";
        return "en";
    }

    private Media downloadCover(String coverUrl) {
        try {
            return mediaService.storeResized("wattpad-cover", wattpad.downloadCover(coverUrl), COVER_SIDE);
        } catch (RuntimeException e) {
            log.warn("Could not store a Wattpad cover: {}", e.toString());
            return null;
        }
    }

    /** Only Wattpad image hosts are fetched, so a crafted request cannot make the server call anything else. */
    private static void requireWattpadImageHost(String url) {
        if (!isWattpadImageHost(url)) {
            throw new InvalidNovelException(List.of(new FieldError("coverUrl", "Use a cover image from wattpad.com.")));
        }
    }

    static boolean isWattpadImageHost(String url) {
        String host = null;
        String scheme = null;
        try {
            URI uri = URI.create(url);
            host = uri.getHost() == null ? null : uri.getHost().toLowerCase(Locale.ROOT);
            scheme = uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            return false;
        }
        return "https".equals(scheme) && host != null
                && (host.equals("wattpad.com") || host.endsWith(".wattpad.com"));
    }

    private static NovelRequest withCover(NovelRequest r, long mediaId) {
        return new NovelRequest(r.slug(), r.title(), mediaId, r.originalAuthor(), r.description(), r.tags(),
                r.novelStatus(), r.translatorCredit(), r.sourceUrl(), r.promptProfile(), r.trailerUrl(),
                r.sourceType(), r.sourceLanguage(), r.wattpadStoryId(), null);
    }

    private static NovelRequest withProfile(NovelRequest r, String profile) {
        return new NovelRequest(r.slug(), r.title(), r.coverMediaId(), r.originalAuthor(), r.description(), r.tags(),
                r.novelStatus(), r.translatorCredit(), r.sourceUrl(), profile, r.trailerUrl(),
                r.sourceType(), r.sourceLanguage(), r.wattpadStoryId(), r.coverUrl());
    }

    private static String storyId(String link) {
        return WattpadLink.storyId(link).orElseThrow(() -> new InvalidFanficLinkException(
                WattpadLink.isChapterLink(link) ? FanficService.CHAPTER_LINK : FanficService.NOT_A_STORY_LINK));
    }
}
