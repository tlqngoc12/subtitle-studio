package com.subtitlestudio.work;

import com.subtitlestudio.profile.FieldError;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * The checks of a work request that need no database (limits, link and credit rules). {@link #normalise} first strips
 * text, turns blanks into null, fills default link labels and clears characters outside Film and TV; {@link #check}
 * then lists every problem at once with field paths such as {@code links[2].url}.
 */
@Component
public class WorkValidator {

    static final int MAX_TITLE = 200;
    static final int MAX_SUBCATEGORY = 50;
    static final int MAX_DESCRIPTION = 2000;
    static final int MAX_LINKS = 20;
    static final int MAX_LABEL = 60;
    static final int MAX_URL = 500;
    static final int MAX_CREDITS = 30;
    static final int MAX_ROLE = 40;
    static final int MAX_CHARACTER = 100;

    /** Must match the frontend's ICON_KEYS (components/ui/LinkIcon.tsx). */
    static final Set<String> ICONS = Set.of("youtube", "x", "instagram", "tiktok", "facebook", "netflix", "spotify",
            "applemusic", "line", "threads", "link");

    private static final Map<LinkKind, String> DEFAULT_LABELS = Map.of(LinkKind.PILOT, "Pilot",
            LinkKind.TRAILER, "Trailer", LinkKind.X, "X", LinkKind.INSTAGRAM, "Instagram");

    public WorkRequest normalise(WorkRequest r) {
        boolean film = r.category() == WorkCategory.FILM_TV;
        List<WorkLinkRequest> links = new ArrayList<>();
        for (WorkLinkRequest l : r.links() == null ? List.<WorkLinkRequest>of() : r.links()) {
            String label = blankToNull(l.label());
            if (label == null && l.kind() != null) {
                label = DEFAULT_LABELS.get(l.kind());
            }
            links.add(new WorkLinkRequest(l.kind(), label, blankToNull(l.url()), blankToNull(l.icon())));
        }
        List<WorkCreditRequest> credits = new ArrayList<>();
        for (WorkCreditRequest c : r.credits() == null ? List.<WorkCreditRequest>of() : r.credits()) {
            credits.add(new WorkCreditRequest(c.personId(), blankToNull(c.role()),
                    film ? blankToNull(c.characterName()) : null));
        }
        return new WorkRequest(blankToNull(r.title()), r.coverMediaId(), r.releaseDate(), r.category(),
                blankToNull(r.subcategory()), blankToNull(r.profile()), blankToNull(r.description()), links, credits);
    }

    /** Every problem of an already normalised request. */
    public List<FieldError> check(WorkRequest r) {
        List<FieldError> errors = new ArrayList<>();
        if (r.title() == null) {
            errors.add(new FieldError("title", "Title is required"));
        } else if (r.title().length() > MAX_TITLE) {
            errors.add(new FieldError("title", "Title is longer than " + MAX_TITLE + " characters"));
        }
        if (r.category() == null) {
            errors.add(new FieldError("category", "Choose a category"));
        }
        if (r.subcategory() != null && r.subcategory().length() > MAX_SUBCATEGORY) {
            errors.add(new FieldError("subcategory", "Longer than " + MAX_SUBCATEGORY + " characters"));
        }
        if (r.description() != null && r.description().length() > MAX_DESCRIPTION) {
            errors.add(new FieldError("description", "Longer than " + MAX_DESCRIPTION + " characters"));
        }
        checkLinks(r.links(), errors);
        checkCredits(r.credits(), errors);
        return errors;
    }

    private static void checkLinks(List<WorkLinkRequest> links, List<FieldError> errors) {
        if (links.size() > MAX_LINKS) {
            errors.add(new FieldError("links", "At most " + MAX_LINKS + " links"));
            return;
        }
        Set<LinkKind> seen = EnumSet.noneOf(LinkKind.class);
        for (int i = 0; i < links.size(); i++) {
            WorkLinkRequest l = links.get(i);
            String p = "links[" + i + "].";
            if (l.kind() == null) {
                errors.add(new FieldError(p + "kind", "Choose a link type"));
            } else if (l.kind() != LinkKind.OTHER && !seen.add(l.kind())) {
                errors.add(new FieldError(p + "kind", "Only one " + l.kind().name().toLowerCase(Locale.ROOT)
                        + " link is allowed"));
            }
            if (l.label() == null) {
                errors.add(new FieldError(p + "label", "Required"));
            } else if (l.label().length() > MAX_LABEL) {
                errors.add(new FieldError(p + "label", "Longer than " + MAX_LABEL + " characters"));
            }
            if (l.url() == null) {
                errors.add(new FieldError(p + "url", "Required"));
            } else if (l.url().length() > MAX_URL || !isWebUrl(l.url())) {
                errors.add(new FieldError(p + "url", "Links must start with http:// or https://"));
            }
            if (l.icon() != null && !ICONS.contains(l.icon())) {
                errors.add(new FieldError(p + "icon", "Unknown icon"));
            }
        }
    }

    private static void checkCredits(List<WorkCreditRequest> credits, List<FieldError> errors) {
        if (credits.size() > MAX_CREDITS) {
            errors.add(new FieldError("credits", "At most " + MAX_CREDITS + " people"));
            return;
        }
        Set<Long> people = new HashSet<>();
        for (int i = 0; i < credits.size(); i++) {
            WorkCreditRequest c = credits.get(i);
            String p = "credits[" + i + "].";
            if (!people.add(c.personId())) {
                errors.add(new FieldError(p + "personId", "This person is already listed"));
            }
            if (c.role() != null && c.role().length() > MAX_ROLE) {
                errors.add(new FieldError(p + "role", "Longer than " + MAX_ROLE + " characters"));
            }
            if (c.characterName() != null && c.characterName().length() > MAX_CHARACTER) {
                errors.add(new FieldError(p + "characterName", "Longer than " + MAX_CHARACTER + " characters"));
            }
        }
    }

    private static boolean isWebUrl(String value) {
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            return (scheme.equals("http") || scheme.equals("https")) && uri.getHost() != null;
        } catch (URISyntaxException e) {
            return false;
        }
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String stripped = value.strip();
        return stripped.isEmpty() ? null : stripped;
    }
}
