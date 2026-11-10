package com.subtitlestudio.photo;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.profile.InvalidBlockException;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaController;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.MediaService;
import com.subtitlestudio.profile.Profile;
import com.subtitlestudio.profile.ProfileRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Photo posts (Instagram posts shown as tiles). All field problems are reported together; the image must have been
 * uploaded with {@code ?maxSide=} so its size is known. A replaced or deleted image goes away when nothing else shows it.
 */
@Service
@Transactional
public class PhotoService {

    static final int MAX_TITLE = 200;
    static final int MAX_PHOTO_COUNT = 99;

    private final PhotoPostRepository posts;
    private final MediaRepository media;
    private final MediaService mediaService;
    private final ProfileRepository profiles;
    private final Clock clock;

    public PhotoService(PhotoPostRepository posts, MediaRepository media, MediaService mediaService,
                        ProfileRepository profiles, Clock clock) {
        this.posts = posts;
        this.media = media;
        this.mediaService = mediaService;
        this.profiles = profiles;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<PhotoPostDto> list() {
        return posts.findAllByOrderByTakenOnDescIdDesc().stream().map(PhotoService::toDto).toList();
    }

    public PhotoPostDto create(PhotoPostRequest request) {
        Instant now = clock.instant();
        PhotoPost post = new PhotoPost(now);
        apply(post, request, now);
        return toDto(posts.saveAndFlush(post));
    }

    public PhotoPostDto update(long id, PhotoPostRequest request) {
        PhotoPost post = posts.findById(id).orElseThrow(() -> new PhotoPostNotFoundException(id));
        Long before = post.getMedia().getId();
        apply(post, request, clock.instant());
        posts.flush();
        if (!before.equals(post.getMedia().getId())) {
            mediaService.deleteIfUnreferenced(List.of(before));
        }
        return toDto(post);
    }

    public void delete(long id) {
        PhotoPost post = posts.findById(id).orElseThrow(() -> new PhotoPostNotFoundException(id));
        Long mediaId = post.getMedia().getId();
        posts.delete(post);
        posts.flush();
        mediaService.deleteIfUnreferenced(List.of(mediaId));
    }

    private void apply(PhotoPost post, PhotoPostRequest r, Instant now) {
        List<FieldError> errors = new ArrayList<>();
        Optional<String> url = InstagramUrl.normalize(r.instagramUrl());
        if (url.isEmpty()) {
            errors.add(new FieldError("instagramUrl", "Paste the link of an Instagram post, reel or video"));
        }
        Media image = null;
        if (r.mediaId() == null) {
            errors.add(new FieldError("mediaId", "No image chosen"));
        } else {
            image = media.findById(r.mediaId()).orElse(null);
            if (image == null) {
                errors.add(new FieldError("mediaId", "The image no longer exists"));
            } else if (image.getWidth() == null || image.getHeight() == null) {
                errors.add(new FieldError("mediaId", "Upload the image again so its size is known"));
            }
        }
        String title = r.title() == null ? "" : r.title().strip();
        if (title.isEmpty() || title.length() > MAX_TITLE) {
            errors.add(new FieldError("title", "Title must be 1-" + MAX_TITLE + " characters"));
        }
        LocalDate on = r.takenOn();
        if (on == null) {
            errors.add(new FieldError("takenOn", "Date is required"));
        } else if (r.takenUntil() != null && r.takenUntil().isBefore(on)) {
            errors.add(new FieldError("takenUntil", "End date cannot be before the date"));
        }
        if (r.source() == null) {
            errors.add(new FieldError("source", "Choose Official, Media or Fan"));
        }
        if (r.photoCount() != null && (r.photoCount() < 1 || r.photoCount() > MAX_PHOTO_COUNT)) {
            errors.add(new FieldError("photoCount", "Photo count must be 1-" + MAX_PHOTO_COUNT));
        }
        Set<Profile> people = new LinkedHashSet<>();
        for (String slug : r.profiles() == null ? List.<String>of() : r.profiles()) {
            Optional<Profile> found = slug == null ? Optional.empty() : profiles.findBySlug(slug);
            if (found.isPresent()) {
                people.add(found.get());
            } else {
                errors.add(new FieldError("profiles", "Unknown person: " + slug));
            }
        }
        if (!errors.isEmpty()) {
            throw new InvalidBlockException(errors);
        }
        posts.findByInstagramUrl(url.get()).filter(existing -> !existing.getId().equals(post.getId()))
                .ifPresent(existing -> {
                    throw new PhotoPostExistsException(existing.getTitle());
                });
        post.set(url.get(), image, title, on, r.takenUntil(), r.source(), r.photoCount(), people, now);
    }

    static PhotoPostDto toDto(PhotoPost p) {
        Media m = p.getMedia();
        List<String> slugs = p.getProfiles().stream()
                .sorted(Comparator.comparingInt(Profile::getSortOrder).thenComparing(Profile::getId))
                .map(Profile::getSlug).toList();
        return new PhotoPostDto(p.getId(), p.getInstagramUrl(), MediaController.url(m.getId()), m.getWidth(),
                m.getHeight(), p.getTitle(), p.getTakenOn(), p.getTakenUntil(), p.getSource(), p.getPhotoCount(), slugs);
    }
}
