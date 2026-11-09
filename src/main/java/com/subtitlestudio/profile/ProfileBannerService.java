package com.subtitlestudio.profile;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Edits the fanned banner of a profile page. The service, not the UI, enforces the limit of
 * {@value #MAX_IMAGES} images, the 200-character alt text and the gapless positions 1..n. An image whose banner
 * row is deleted is removed from disk like any other unused upload ({@link MediaService#deleteIfUnreferenced}).
 */
@Service
@Transactional
public class ProfileBannerService {

    static final int MAX_IMAGES = 8;
    static final int MAX_ALT_TEXT = 200;

    private final ProfileRepository profiles;
    private final ProfileBannerImageRepository images;
    private final MediaRepository media;
    private final MediaService mediaService;
    private final Clock clock;

    public ProfileBannerService(ProfileRepository profiles, ProfileBannerImageRepository images,
                                MediaRepository media, MediaService mediaService, Clock clock) {
        this.profiles = profiles;
        this.images = images;
        this.media = media;
        this.mediaService = mediaService;
        this.clock = clock;
    }

    public List<BannerImageDto> add(String slug, BannerImageRequest request) {
        Profile profile = profile(slug);
        List<ProfileBannerImage> current = images.findByProfileOrderByPositionAscIdAsc(profile);
        List<FieldError> errors = new ArrayList<>();
        String alt = altText(request.altText(), errors);
        if (request.mediaId() == null || !media.existsById(request.mediaId())) {
            errors.add(new FieldError("mediaId", "Upload an image first."));
        }
        if (current.size() >= MAX_IMAGES) {
            errors.add(new FieldError("banner", "A banner holds up to " + MAX_IMAGES + " images."));
        }
        if (!errors.isEmpty()) {
            throw new InvalidBlockException(errors);
        }
        Instant now = clock.instant();
        images.saveAndFlush(new ProfileBannerImage(profile, media.getReferenceById(request.mediaId()),
                current.size() + 1, alt, now));
        profile.touch(now);
        return list(profile);
    }

    public List<BannerImageDto> updateAltText(String slug, long imageId, String altText) {
        Profile profile = profile(slug);
        ProfileBannerImage image = image(profile, imageId);
        List<FieldError> errors = new ArrayList<>();
        String alt = altText(altText, errors);
        if (!errors.isEmpty()) {
            throw new InvalidBlockException(errors);
        }
        image.setAltText(alt);
        profile.touch(clock.instant());
        images.flush();
        return list(profile);
    }

    public List<BannerImageDto> delete(String slug, long imageId) {
        Profile profile = profile(slug);
        ProfileBannerImage image = image(profile, imageId);
        Long mediaId = image.getMedia().getId();
        images.delete(image);
        images.flush();
        List<ProfileBannerImage> rest = images.findByProfileOrderByPositionAscIdAsc(profile);
        for (int i = 0; i < rest.size(); i++) {
            rest.get(i).setPosition(i + 1);
        }
        images.flush(); // isReferenced must not see the deleted row
        mediaService.deleteIfUnreferenced(List.of(mediaId));
        profile.touch(clock.instant());
        return list(profile);
    }

    /** {@code imageIds} must list every image of the profile exactly once; otherwise nothing changes. */
    public List<BannerImageDto> reorder(String slug, List<Long> imageIds) {
        Profile profile = profile(slug);
        List<ProfileBannerImage> current = images.findByProfileOrderByPositionAscIdAsc(profile);
        Set<Long> expected = current.stream().map(ProfileBannerImage::getId).collect(Collectors.toSet());
        if (imageIds == null || imageIds.size() != expected.size() || !expected.equals(new HashSet<>(imageIds))) {
            throw new InvalidBlockException(List.of(new FieldError("imageIds",
                    "List every banner image of this profile exactly once.")));
        }
        Map<Long, ProfileBannerImage> byId = current.stream()
                .collect(Collectors.toMap(ProfileBannerImage::getId, Function.identity()));
        for (int i = 0; i < imageIds.size(); i++) {
            byId.get(imageIds.get(i)).setPosition(i + 1);
        }
        profile.touch(clock.instant());
        images.flush();
        return list(profile);
    }

    private List<BannerImageDto> list(Profile profile) {
        return toDtos(images.findByProfileOrderByPositionAscIdAsc(profile));
    }

    static List<BannerImageDto> toDtos(List<ProfileBannerImage> list) {
        return list.stream().map(i -> {
            long mediaId = i.getMedia().getId();
            return new BannerImageDto(i.getId(), mediaId, MediaController.url(mediaId), i.getAltText());
        }).toList();
    }

    /** Trimmed alt text; blank is none (null). Records an error when it is longer than the limit. */
    private static String altText(String raw, List<FieldError> errors) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String alt = raw.strip();
        if (alt.length() > MAX_ALT_TEXT) {
            errors.add(new FieldError("altText", "Use at most " + MAX_ALT_TEXT + " characters."));
            return null;
        }
        return alt;
    }

    private Profile profile(String slug) {
        return profiles.findBySlug(slug).orElseThrow(() -> new ProfileNotFoundException(slug));
    }

    private ProfileBannerImage image(Profile profile, long imageId) {
        return images.findByIdAndProfile(imageId, profile).orElseThrow(() -> new BannerImageNotFoundException(imageId));
    }
}
