package com.subtitlestudio.novel.wattpad;

import com.subtitlestudio.fanfic.FanficService;
import com.subtitlestudio.fanfic.InvalidFanficLinkException;
import com.subtitlestudio.fanfic.WattpadClient;
import com.subtitlestudio.fanfic.WattpadLink;
import com.subtitlestudio.fanfic.WattpadStory;
import com.subtitlestudio.fanfic.WattpadStoryParts;
import com.subtitlestudio.novel.DuplicateWattpadNovelException;
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

    private final WattpadClient wattpad;
    private final NovelRepository novels;
    private final NovelService novelService;
    private final MediaService mediaService;

    public WattpadNovelService(WattpadClient wattpad, NovelRepository novels, NovelService novelService,
                               MediaService mediaService) {
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
                WattpadLink.canonicalUrl(storyId), existing);
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
        try {
            return novelService.create(toCreate);
        } catch (RuntimeException e) {
            if (cover != null) {
                mediaService.deleteIfUnreferenced(List.of(cover.getId()));
            }
            throw e;
        }
    }

    static String guessLanguage(String languageName) {
        return languageName != null && languageName.strip().toLowerCase(Locale.ROOT).startsWith("thai") ? "th" : "en";
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
        String host = null;
        String scheme = null;
        try {
            URI uri = URI.create(url);
            host = uri.getHost() == null ? null : uri.getHost().toLowerCase(Locale.ROOT);
            scheme = uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            // falls through to the error below
        }
        boolean ok = "https".equals(scheme) && host != null
                && (host.equals("wattpad.com") || host.endsWith(".wattpad.com"));
        if (!ok) {
            throw new InvalidNovelException(List.of(new FieldError("coverUrl", "Use a cover image from wattpad.com.")));
        }
    }

    private static NovelRequest withCover(NovelRequest r, long mediaId) {
        return new NovelRequest(r.slug(), r.title(), mediaId, r.originalAuthor(), r.description(), r.tags(),
                r.novelStatus(), r.translatorCredit(), r.sourceUrl(), r.promptProfile(), r.trailerUrl(),
                r.sourceType(), r.sourceLanguage(), r.wattpadStoryId(), null);
    }

    private static String storyId(String link) {
        return WattpadLink.storyId(link).orElseThrow(() -> new InvalidFanficLinkException(
                WattpadLink.isChapterLink(link) ? FanficService.CHAPTER_LINK : FanficService.NOT_A_STORY_LINK));
    }
}
