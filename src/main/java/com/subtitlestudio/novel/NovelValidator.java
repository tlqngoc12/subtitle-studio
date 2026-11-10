package com.subtitlestudio.novel;

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
        NovelRequest n = new NovelRequest(trim(r.slug()), trim(r.title()), r.coverMediaId(), trim(r.originalAuthor()),
                trim(r.description()), tags(r.tags()), r.novelStatus(), trim(r.translatorCredit()),
                trim(r.sourceUrl()), trim(r.promptProfile()), trim(r.trailerUrl()));
        List<FieldError> errors = new ArrayList<>();
        if (n.slug() == null || n.slug().length() > MAX_SLUG || !SLUG.matcher(n.slug()).matches()) {
            errors.add(new FieldError("slug", "Use lowercase letters, numbers and single hyphens."));
        }
        if (n.title() == null) {
            errors.add(new FieldError("title", "Title is required."));
        } else if (n.title().length() > MAX_TITLE) {
            errors.add(new FieldError("title", "Use at most " + MAX_TITLE + " characters."));
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
                n.novelStatus(), n.translatorCredit(), n.sourceUrl(), n.promptProfile(), trailerId);
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
