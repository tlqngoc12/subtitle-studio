package com.subtitlestudio.novel;

import com.subtitlestudio.fanfic.WattpadLink;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.common.YouTubeIds;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** Trims a {@link NovelRequest} and checks it against the limits of spec section 3. */
@Component
public class NovelValidator {

    static final int MAX_TITLE = 200;
    static final int MAX_SLUG = 60;
    static final int MAX_AUTHOR = 200;
    static final int MAX_DESCRIPTION = 5_000;
    static final int MAX_TAGS = 10;
    static final int MAX_TAG = 40;
    static final int MAX_CREDIT = 200;
    static final int MAX_URL = 1_000;

    /** The stored source language of an ORIGINAL story (the only kind that may use it). */
    static final String ORIGINAL_LANGUAGE = "vi";

    static final java.util.Set<String> LANGUAGES = java.util.Set.of("th", "en", "es");

    private static final Pattern STORY_ID = Pattern.compile("\\d{1,19}");
    private static final Pattern SLUG = Pattern.compile("[a-z0-9]+(-[a-z0-9]+)*");

    private final NovelProfileStore profiles;

    public NovelValidator(NovelProfileStore profiles) {
        this.profiles = profiles;
    }

    /**
     * The trimmed request (blank optional fields become null, empty tags are dropped). In the result
     * {@code trailerUrl} holds the 11-character YouTube video id (or null), not the link.
     */
    public NovelRequest validate(NovelRequest r) {
        NovelSourceType type = r.sourceType() == null ? NovelSourceType.SCREENSHOTS : r.sourceType();
        boolean original = type == NovelSourceType.ORIGINAL;
        // An original story is Vietnamese whatever the request says, and has no translator or source link.
        NovelRequest n = new NovelRequest(trim(r.slug()), trim(r.title()), r.coverMediaId(), trim(r.originalAuthor()),
                trim(r.description()), tags(r.tags()), r.novelStatus(), original ? null : trim(r.translatorCredit()),
                original ? null : trim(r.sourceUrl()), trim(r.promptProfile()), trim(r.trailerUrl()), type,
                original ? ORIGINAL_LANGUAGE
                        : r.sourceLanguage() == null ? "th" : r.sourceLanguage().strip().toLowerCase(java.util.Locale.ROOT),
                original ? null : trim(r.wattpadStoryId()), original ? null : trim(r.coverUrl()),
                original ? trim(r.wattpadUrl()) : null);
        List<FieldError> errors = new ArrayList<>();
        if (n.slug() == null || n.slug().length() > MAX_SLUG || !SLUG.matcher(n.slug()).matches()) {
            errors.add(new FieldError("slug", "Use lowercase letters, numbers and single hyphens."));
        }
        if (n.title() == null) {
            errors.add(new FieldError("title", "Title is required."));
        } else if (n.title().length() > MAX_TITLE) {
            errors.add(new FieldError("title", "Use at most " + MAX_TITLE + " characters."));
        }
        if (original && n.originalAuthor() == null) {
            errors.add(new FieldError("originalAuthor", "Author is required."));
        }
        tooLong(errors, "originalAuthor", n.originalAuthor(), MAX_AUTHOR);
        tooLong(errors, "description", n.description(), MAX_DESCRIPTION);
        tooLong(errors, "translatorCredit", n.translatorCredit(), MAX_CREDIT);
        if (n.tags().size() > MAX_TAGS) {
            errors.add(new FieldError("tags", "Use at most " + MAX_TAGS + " tags."));
        } else if (n.tags().stream().anyMatch(t -> t.length() > MAX_TAG || t.contains(","))) {
            errors.add(new FieldError("tags", "Each tag is at most " + MAX_TAG + " characters, without commas."));
        }
        if (n.novelStatus() == null) {
            errors.add(new FieldError("novelStatus", "Choose Ongoing or Completed."));
        }
        if (n.sourceUrl() != null && (n.sourceUrl().length() > MAX_URL || !isHttp(n.sourceUrl()))) {
            errors.add(new FieldError("sourceUrl", "Use an http(s) link."));
        }
        if (n.promptProfile() != null && !profiles.list().contains(n.promptProfile())) {
            errors.add(new FieldError("promptProfile", "Unknown translation profile."));
        }
        if (!original && !LANGUAGES.contains(n.sourceLanguage())) {
            errors.add(new FieldError("sourceLanguage", "Choose Thai, English or Spanish."));
        }
        if (n.sourceType() == NovelSourceType.WATTPAD) {
            if (n.wattpadStoryId() == null || !STORY_ID.matcher(n.wattpadStoryId()).matches()) {
                errors.add(new FieldError("wattpadStoryId", "A Wattpad story id (digits) is required."));
            }
        }
        String originalStoryId = null;
        if (original && n.wattpadUrl() != null) {
            originalStoryId = WattpadLink.storyId(n.wattpadUrl()).orElse(null);
            if (originalStoryId == null) {
                errors.add(new FieldError("wattpadUrl", WattpadLink.isChapterLink(n.wattpadUrl())
                        ? "Paste the story link (wattpad.com/story/…), not a chapter link."
                        : "Use a Wattpad story link (wattpad.com/story/…)."));
            }
        }
        String trailerId = null;
        if (n.trailerUrl() != null) {
            trailerId = trailerId(n.trailerUrl());
            if (trailerId == null) {
                errors.add(new FieldError("trailerUrl", "Use a YouTube link (youtube.com or youtu.be)."));
            }
        }
        if (!errors.isEmpty()) {
            throw new InvalidNovelException(errors);
        }
        return new NovelRequest(n.slug(), n.title(), n.coverMediaId(), n.originalAuthor(), n.description(), n.tags(),
                n.novelStatus(), n.translatorCredit(), n.sourceUrl(), n.promptProfile(), trailerId, n.sourceType(),
                n.sourceLanguage(), n.sourceType() == NovelSourceType.WATTPAD ? n.wattpadStoryId() : originalStoryId,
                n.sourceType() == NovelSourceType.WATTPAD ? n.coverUrl() : null, null);
    }

    /** The video id of a YouTube link, or null when it is too long or not a YouTube video link. */
    private String trailerId(String url) {
        return url.length() > MAX_URL ? null : YouTubeIds.videoId(url).orElse(null);
    }

    private static void tooLong(List<FieldError> errors, String field, String value, int max) {
        if (value != null && value.length() > max) {
            errors.add(new FieldError(field, "Use at most " + max + " characters."));
        }
    }

    private static boolean isHttp(String url) {
        String lower = url.toLowerCase();
        return (lower.startsWith("http://") || lower.startsWith("https://")) && !url.contains(" ");
    }

    private static List<String> tags(List<String> tags) {
        if (tags == null) {
            return List.of();
        }
        return tags.stream().map(NovelValidator::trim).filter(t -> t != null).toList();
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String t = value.strip();
        return t.isEmpty() ? null : t;
    }
}
