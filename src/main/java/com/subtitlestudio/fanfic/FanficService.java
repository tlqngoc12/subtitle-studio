package com.subtitlestudio.fanfic;

import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaController;
import com.subtitlestudio.profile.MediaService;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fanfics (Wattpad stories). Wattpad is called only by preview, add, refresh and refresh all, and never inside a
 * database transaction, so a slow Wattpad cannot hold a connection; each story is saved on its own, so one failing
 * story never undoes the others.
 */
@Service
public class FanficService {

    static final int PAUSE_BETWEEN_STORIES_MS = 500;
    static final int WORDS_PER_MINUTE = 230;
    public static final String CHAPTER_LINK = "Use the story link (wattpad.com/story/…), not a chapter link.";
    public static final String NOT_A_STORY_LINK = "Paste a Wattpad story link (wattpad.com/story/…).";
    static final String WATTPAD_DID_NOT_ANSWER = "Wattpad did not answer. Try again later.";
    private static final int COVER_SIDE = 512;
    private static final Logger log = LoggerFactory.getLogger(FanficService.class);

    private final FanficRepository fanfics;
    private final WattpadClient wattpad;
    private final MediaService mediaService;
    private final Sleeper sleeper;
    private final Clock clock;

    public FanficService(FanficRepository fanfics, WattpadClient wattpad, MediaService mediaService, Sleeper sleeper,
                         Clock clock) {
        this.fanfics = fanfics;
        this.wattpad = wattpad;
        this.mediaService = mediaService;
        this.sleeper = sleeper;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<FanficDto> list() {
        return fanfics.findAllByOrderByStoryUpdatedAtDescIdDesc().stream().map(FanficService::toDto).toList();
    }

    /** Builds the card from Wattpad without saving anything. */
    public FanficDto preview(String link) {
        String storyId = requireNotAdded(storyId(link));
        WattpadStory story = wattpad.fetch(storyId);
        return toDto(story, storyId, clock.instant());
    }

    public FanficDto add(String link) {
        String storyId = requireNotAdded(storyId(link));
        WattpadStory story = wattpad.fetch(storyId);
        Instant now = clock.instant();
        Media cover = downloadCover(story.coverUrl());
        Fanfic f = new Fanfic(now);
        apply(f, storyId, story, cover, cover == null ? null : story.coverUrl(), now);
        try {
            return toDto(fanfics.saveAndFlush(f));
        } catch (DataIntegrityViolationException e) {
            // Added twice at the same moment: the unique wattpad_id caught it.
            if (cover != null) {
                mediaService.deleteIfUnreferenced(List.of(cover.getId()));
            }
            throw fanfics.findByWattpadId(storyId).<RuntimeException>map(x -> new FanficExistsException(x.getTitle()))
                    .orElse(e);
        }
    }

    public FanficDto refresh(long id) {
        Fanfic f = fanfics.findById(id).orElseThrow(() -> new FanficNotFoundException(id));
        return refreshOne(f);
    }

    /** Refreshes every story one after the other; a story that fails is reported and its old data stays. */
    public RefreshAllResult refreshAll() {
        List<Fanfic> all = fanfics.findAllByOrderByStoryUpdatedAtDescIdDesc();
        int updated = 0;
        List<RefreshAllResult.Failure> failed = new ArrayList<>();
        for (int i = 0; i < all.size(); i++) {
            if (i > 0) {
                sleeper.sleep(PAUSE_BETWEEN_STORIES_MS);
            }
            Fanfic f = all.get(i);
            try {
                refreshOne(f);
                updated++;
            } catch (RuntimeException e) {
                log.warn("Could not refresh fanfic {}: {}", f.getId(), e.toString());
                failed.add(new RefreshAllResult.Failure(f.getId(), f.getTitle(), messageOf(e)));
            }
        }
        return new RefreshAllResult(updated, failed);
    }

    public void delete(long id) {
        Fanfic f = fanfics.findById(id).orElseThrow(() -> new FanficNotFoundException(id));
        Long coverId = f.getCover() == null ? null : f.getCover().getId();
        fanfics.delete(f);
        fanfics.flush();
        mediaService.deleteIfUnreferenced(Arrays.asList(coverId));
    }

    private FanficDto refreshOne(Fanfic f) {
        WattpadStory story = wattpad.fetch(f.getWattpadId());
        Instant now = clock.instant();
        Media oldCover = f.getCover();
        Media cover = oldCover;
        String coverSource = f.getCoverSourceUrl();
        if (story.coverUrl() != null && !story.coverUrl().equals(coverSource)) {
            Media fresh = downloadCover(story.coverUrl());
            if (fresh != null) {
                cover = fresh;
                coverSource = story.coverUrl();
            }
        }
        apply(f, f.getWattpadId(), story, cover, coverSource, now);
        Fanfic saved = fanfics.saveAndFlush(f);
        if (oldCover != null && cover != oldCover) {
            mediaService.deleteIfUnreferenced(List.of(oldCover.getId()));
        }
        return toDto(saved);
    }

    /** A cover that cannot be fetched or decoded never blocks the story: it is shown without one. */
    private Media downloadCover(String coverUrl) {
        if (coverUrl == null) {
            return null;
        }
        try {
            return mediaService.storeResized("wattpad-cover", wattpad.downloadCover(coverUrl), COVER_SIDE);
        } catch (RuntimeException e) {
            log.warn("Could not store a Wattpad cover: {}", e.toString());
            return null;
        }
    }

    private void apply(Fanfic f, String storyId, WattpadStory s, Media cover, String coverSource, Instant now) {
        f.set(storyId, WattpadLink.canonicalUrl(storyId), s.title(), s.author(), s.description(),
                String.join(" ", s.tags()), cover, coverSource, s.readCount(), s.voteCount(), s.partCount(),
                s.wordCount(), s.completed(), s.storyUpdatedAt(), now);
    }

    private static String storyId(String link) {
        return WattpadLink.storyId(link).orElseThrow(() -> new InvalidFanficLinkException(
                WattpadLink.isChapterLink(link) ? CHAPTER_LINK : NOT_A_STORY_LINK));
    }

    private String requireNotAdded(String storyId) {
        fanfics.findByWattpadId(storyId).ifPresent(existing -> {
            throw new FanficExistsException(existing.getTitle());
        });
        return storyId;
    }

    private static String messageOf(RuntimeException e) {
        if (e instanceof FanficNotFoundException) {
            return e.getMessage();
        }
        if (e instanceof WattpadUnavailableException) {
            return WATTPAD_DID_NOT_ANSWER;
        }
        return "Could not update this story.";
    }

    static long readingMinutes(long wordCount) {
        return Math.round(wordCount / (double) WORDS_PER_MINUTE);
    }

    private static List<String> splitTags(String tags) {
        return tags == null || tags.isBlank() ? List.of() : Arrays.stream(tags.split(" ")).filter(t -> !t.isEmpty()).toList();
    }

    static FanficDto toDto(Fanfic f) {
        String cover = f.getCover() == null ? null : MediaController.url(f.getCover().getId());
        return new FanficDto(f.getId(), f.getUrl(), f.getTitle(), f.getAuthor(), f.getDescription(),
                splitTags(f.getTags()), cover, f.getReadCount(), f.getVoteCount(), f.getPartCount(), f.getWordCount(),
                readingMinutes(f.getWordCount()), f.isCompleted(), f.getStoryUpdatedAt(), f.getFetchedAt(),
                f.getCreatedAt());
    }

    private static FanficDto toDto(WattpadStory s, String storyId, Instant now) {
        return new FanficDto(null, WattpadLink.canonicalUrl(storyId), s.title(), s.author(), s.description(),
                s.tags().stream().filter(Objects::nonNull).toList(), s.coverUrl(), s.readCount(), s.voteCount(),
                s.partCount(), s.wordCount(), readingMinutes(s.wordCount()), s.completed(), s.storyUpdatedAt(), now,
                null);
    }
}
