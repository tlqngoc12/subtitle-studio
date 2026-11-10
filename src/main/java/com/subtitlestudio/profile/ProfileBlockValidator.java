package com.subtitlestudio.profile;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.LongPredicate;
import org.springframework.stereotype.Component;

/**
 * Checks a block request against the rules of its type (spec sections 3 and 5) and normalises it: optional text is
 * stripped and blank becomes null (Oracle stores '' as NULL), fields of other types are dropped, embed links become
 * embed URLs. All problems are reported at once.
 */
@Component
public class ProfileBlockValidator {

    static final int MAX_TITLE = 200;
    static final int MAX_CAPTION = 500;
    static final int MAX_BODY = 100_000;
    static final int MAX_LABEL = 200;
    static final int MAX_VALUE = 1000;
    static final int MAX_ITEMS = 50;
    static final int MAX_CHIP = 100;

    private final EmbedUrlResolver embedUrls;

    public ProfileBlockValidator(EmbedUrlResolver embedUrls) {
        this.embedUrls = embedUrls;
    }

    public ValidBlock validate(BlockRequest request, LongPredicate mediaExists) {
        List<FieldError> errors = new ArrayList<>();
        BlockType type = request.type();
        if (type == null) {
            throw new InvalidBlockException(List.of(new FieldError("type", "Block type is required")));
        }
        String title = optional(request.title(), "title", MAX_TITLE, errors);
        String body = null;
        Long mediaId = null;
        String caption = null;
        String embedUrl = null;
        List<ValidItem> items = List.of();

        switch (type) {
            case TEXT -> {
                if (request.body() == null || request.body().isBlank()) {
                    errors.add(new FieldError("body", "Content is required"));
                } else if (request.body().length() > MAX_BODY) {
                    errors.add(new FieldError("body", "Content is longer than " + MAX_BODY + " characters"));
                } else {
                    body = request.body();
                }
            }
            case IMAGE -> {
                mediaId = media(request.mediaId(), "mediaId", mediaExists, errors);
                caption = optional(request.caption(), "caption", MAX_CAPTION, errors);
            }
            case EMBED -> {
                embedUrl = embedUrls.resolve(request.embedUrl()).orElse(null);
                if (embedUrl == null) {
                    errors.add(new FieldError("embedUrl", "Only YouTube or Spotify links are supported"));
                }
            }
            case GALLERY, LINKS, FACTS, CHIPS -> items = items(type, request.items(), mediaExists, errors);
        }

        if (!errors.isEmpty()) {
            throw new InvalidBlockException(errors);
        }
        return new ValidBlock(type, title, body, mediaId, caption, embedUrl, items);
    }

    private List<ValidItem> items(BlockType type, List<ItemRequest> requested, LongPredicate mediaExists,
                                  List<FieldError> errors) {
        if (requested == null || requested.isEmpty()) {
            errors.add(new FieldError("items", "Add at least one item"));
            return List.of();
        }
        if (requested.size() > MAX_ITEMS) {
            errors.add(new FieldError("items", "At most " + MAX_ITEMS + " items"));
            return List.of();
        }
        List<ValidItem> items = new ArrayList<>(requested.size());
        for (int i = 0; i < requested.size(); i++) {
            ItemRequest r = requested.get(i);
            String prefix = "items[" + i + "].";
            switch (type) {
                case GALLERY -> items.add(new ValidItem(
                        optional(r.label(), prefix + "label", MAX_LABEL, errors), null,
                        media(r.mediaId(), prefix + "mediaId", mediaExists, errors)));
                case LINKS -> {
                    String label = required(r.label(), prefix + "label", MAX_LABEL, errors);
                    String url = required(r.value(), prefix + "value", MAX_VALUE, errors);
                    if (url != null && !isWebUrl(url)) {
                        errors.add(new FieldError(prefix + "value", "Links must start with http:// or https://"));
                    }
                    items.add(new ValidItem(label, url, null));
                }
                case FACTS -> items.add(new ValidItem(
                        required(r.label(), prefix + "label", MAX_LABEL, errors),
                        required(r.value(), prefix + "value", MAX_VALUE, errors), null));
                case CHIPS -> {
                    items.add(new ValidItem(required(r.label(), prefix + "label", MAX_CHIP, errors), null, null));
                    if (r.value() != null && !r.value().isBlank()) {
                        errors.add(new FieldError(prefix + "value", "Chips have a label only"));
                    }
                    if (r.mediaId() != null) {
                        errors.add(new FieldError(prefix + "mediaId", "Chips have a label only"));
                    }
                }
                default -> throw new IllegalStateException(type.name());
            }
        }
        return items;
    }

    private static Long media(Long id, String field, LongPredicate mediaExists, List<FieldError> errors) {
        if (id == null) {
            errors.add(new FieldError(field, "No image chosen"));
            return null;
        }
        if (!mediaExists.test(id)) {
            errors.add(new FieldError(field, "The image no longer exists"));
            return null;
        }
        return id;
    }

    private static String optional(String value, String field, int max, List<FieldError> errors) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String stripped = value.strip();
        if (stripped.length() > max) {
            errors.add(new FieldError(field, "Longer than " + max + " characters"));
        }
        return stripped;
    }

    private static String required(String value, String field, int max, List<FieldError> errors) {
        String stripped = optional(value, field, max, errors);
        if (stripped == null) {
            errors.add(new FieldError(field, "Required"));
        }
        return stripped;
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
}
