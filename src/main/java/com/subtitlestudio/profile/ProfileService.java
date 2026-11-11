package com.subtitlestudio.profile;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads and edits profile blocks (spec section 5). Images a change leaves unused are deleted with it. */
@Service
@Transactional
public class ProfileService {

    static final int MAX_NAME = 100;
    static final int MAX_TAGLINE = 300;
    static final int MAX_FULL_NAME = 200;

    private final ProfileRepository profiles;
    private final ProfileBlockRepository blocks;
    private final ProfileBannerImageRepository banner;
    private final MediaRepository media;
    private final MediaService mediaService;
    private final ProfileBlockValidator validator;
    private final Clock clock;

    public ProfileService(ProfileRepository profiles, ProfileBlockRepository blocks,
                          ProfileBannerImageRepository banner, MediaRepository media, MediaService mediaService, ProfileBlockValidator validator, Clock clock) {
        this.profiles = profiles;
        this.blocks = blocks;
        this.banner = banner;
        this.media = media;
        this.mediaService = mediaService;
        this.validator = validator;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ProfilePageDto page() {
        List<Profile> all = profiles.findAllByOrderBySortOrderAscIdAsc();
        ProfileDto group = null;
        List<ProfileDto> members = new ArrayList<>();
        for (Profile p : all) {
            if (p.getKind() == ProfileKind.GROUP) {
                group = dto(p);
            } else {
                members.add(dto(p));
            }
        }
        return new ProfilePageDto(group, members);
    }

    @Transactional(readOnly = true)
    public ProfileDto get(String slug) {
        return dto(profile(slug));
    }

    /** Sets display name, tagline, full name and portrait; a replaced portrait is deleted when nothing else uses it. */
    public ProfileDto updateHeader(String slug, ProfileHeaderRequest r) {
        Profile profile = profile(slug);
        List<FieldError> errors = new ArrayList<>();
        String name = r.displayName() == null ? "" : r.displayName().strip();
        if (name.isEmpty() || name.length() > MAX_NAME) {
            errors.add(new FieldError("displayName", "Name must be 1-" + MAX_NAME + " characters"));
        }
        String tagline = optional(r.tagline(), "tagline", MAX_TAGLINE, errors);
        String fullName = optional(r.fullName(), "fullName", MAX_FULL_NAME, errors);
        if (r.portraitMediaId() != null && !media.existsById(r.portraitMediaId())) {
            errors.add(new FieldError("portraitMediaId", "The image no longer exists"));
        }
        if (!errors.isEmpty()) {
            throw new InvalidBlockException(errors);
        }
        Long before = profile.getPortrait() == null ? null : profile.getPortrait().getId();
        profile.updateHeader(name, tagline, fullName, mediaRef(r.portraitMediaId()), clock.instant());
        profiles.flush();
        if (before != null) {
            mediaService.deleteIfUnreferenced(List.of(before));
        }
        return dto(profile);
    }

    public ProfileDto addMember(NewMemberRequest r) {
        String name = r == null || r.displayName() == null ? "" : r.displayName().strip();
        if (name.isEmpty() || name.length() > MAX_NAME) {
            throw new InvalidBlockException(List.of(
                    new FieldError("displayName", "Name must be 1-" + MAX_NAME + " characters")));
        }
        String slug = SlugGenerator.slugFor(name, profiles::existsBySlug);
        Profile member = profiles.saveAndFlush(Profile.member(slug, name, profiles.maxSortOrder() + 1, clock.instant()));
        return dto(member);
    }

    /** Deletes a member with its blocks and banner rows; images nothing else shows are deleted too. */
    public void deleteMember(String slug) {
        Profile profile = profile(slug);
        if (profile.getKind() == ProfileKind.GROUP) {
            throw new GroupProfileException();
        }
        List<ProfileBlock> memberBlocks = blocks.findByProfileOrderByPositionAscIdAsc(profile);
        List<ProfileBannerImage> bannerRows = banner.findByProfileOrderByPositionAscIdAsc(profile);
        List<Long> mediaIds = new ArrayList<>();
        memberBlocks.forEach(b -> mediaIds.addAll(mediaIds(b)));
        bannerRows.forEach(i -> mediaIds.add(i.getMedia().getId()));
        if (profile.getPortrait() != null) {
            mediaIds.add(profile.getPortrait().getId());
        }
        blocks.deleteAll(memberBlocks);
        banner.deleteAll(bannerRows);
        profiles.delete(profile);
        profiles.flush();
        mediaService.deleteIfUnreferenced(mediaIds);
    }

    /** {@code slugs} must list every member exactly once; the order becomes the page order. */
    public List<ProfileDto> reorder(MemberOrderRequest r) {
        List<Profile> members = profiles.findAllByOrderBySortOrderAscIdAsc().stream()
                .filter(p -> p.getKind() == ProfileKind.MEMBER).toList();
        Set<String> expected = members.stream().map(Profile::getSlug).collect(Collectors.toSet());
        List<String> slugs = r == null ? null : r.slugs();
        if (slugs == null || slugs.size() != expected.size() || !expected.equals(new HashSet<>(slugs))) {
            throw new InvalidBlockException(List.of(new FieldError("slugs", "List every member exactly once.")));
        }
        Map<String, Profile> bySlug = members.stream().collect(Collectors.toMap(Profile::getSlug, p -> p));
        for (int i = 0; i < slugs.size(); i++) {
            bySlug.get(slugs.get(i)).setSortOrder(i + 1);
        }
        profiles.flush();
        return slugs.stream().map(s -> dto(bySlug.get(s))).toList();
    }

    private ProfileDto dto(Profile profile) {
        List<BlockDto> dtos = blocks.findByProfileOrderByPositionAscIdAsc(profile).stream()
                .map(ProfileService::toDto)
                .toList();
        Long portraitId = profile.getPortrait() == null ? null : profile.getPortrait().getId();
        return new ProfileDto(profile.getSlug(), profile.getDisplayName(), profile.getKind(), profile.getTagline(),
                profile.getFullName(), portraitId, portraitId == null ? null : MediaController.url(portraitId),
                profile.getUpdatedAt(), dtos,
                ProfileBannerService.toDtos(banner.findByProfileOrderByPositionAscIdAsc(profile)));
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

    public BlockDto addBlock(String slug, BlockRequest request) {
        Profile profile = profile(slug);
        ValidBlock valid = validator.validate(request, media::existsById);
        Instant now = clock.instant();
        ProfileBlock block = new ProfileBlock(profile, blocks.maxPosition(profile) + 1, valid.type(), now);
        apply(block, valid, now);
        blocks.saveAndFlush(block);
        profile.touch(now);
        return toDto(block);
    }

    /** Replaces the block's content (the type stays); images it no longer shows are deleted. */
    public BlockDto updateBlock(String slug, long blockId, BlockRequest request) {
        Profile profile = profile(slug);
        ProfileBlock block = block(profile, blockId);
        if (request.type() != null && request.type() != block.getType()) {
            throw new InvalidBlockException(List.of(new FieldError("type", "The block type cannot be changed")));
        }
        ValidBlock valid = validator.validate(request, media::existsById);
        List<Long> before = mediaIds(block);
        Instant now = clock.instant();
        apply(block, valid, now);
        blocks.flush(); // isReferenced must see the new content
        mediaService.deleteIfUnreferenced(before);
        profile.touch(now);
        return toDto(block);
    }

    public void deleteBlock(String slug, long blockId) {
        Profile profile = profile(slug);
        ProfileBlock block = block(profile, blockId);
        List<Long> before = mediaIds(block);
        blocks.delete(block);
        blocks.flush();
        mediaService.deleteIfUnreferenced(before);
        profile.touch(clock.instant());
    }

    /** Swaps the block with its neighbour; at the top (UP) or bottom (DOWN) nothing changes. */
    public List<BlockDto> move(String slug, long blockId, Direction direction) {
        Profile profile = profile(slug);
        List<ProfileBlock> ordered = new ArrayList<>(blocks.findByProfileOrderByPositionAscIdAsc(profile));
        int index = -1;
        for (int i = 0; i < ordered.size(); i++) {
            if (ordered.get(i).getId() == blockId) {
                index = i;
            }
        }
        if (index < 0) {
            throw new BlockNotFoundException(blockId);
        }
        int other = direction == Direction.UP ? index - 1 : index + 1;
        if (other >= 0 && other < ordered.size()) {
            // Renumber 1..n first so equal positions cannot make the swap a no-op.
            for (int i = 0; i < ordered.size(); i++) {
                ordered.get(i).setPosition(i + 1);
            }
            ordered.get(index).setPosition(other + 1);
            ordered.get(other).setPosition(index + 1);
            ordered.sort(Comparator.comparingInt(ProfileBlock::getPosition));
            profile.touch(clock.instant());
        }
        return ordered.stream().map(ProfileService::toDto).toList();
    }

    private Profile profile(String slug) {
        return profiles.findBySlug(slug).orElseThrow(() -> new ProfileNotFoundException(slug));
    }

    private ProfileBlock block(Profile profile, long blockId) {
        return blocks.findByIdAndProfile(blockId, profile).orElseThrow(() -> new BlockNotFoundException(blockId));
    }

    private void apply(ProfileBlock block, ValidBlock valid, Instant now) {
        List<ProfileBlockItem> items = new ArrayList<>(valid.items().size());
        for (int i = 0; i < valid.items().size(); i++) {
            ValidItem item = valid.items().get(i);
            items.add(new ProfileBlockItem(block, i + 1, item.label(), item.value(), mediaRef(item.mediaId())));
        }
        block.setContent(valid.title(), valid.body(), mediaRef(valid.mediaId()), valid.caption(), valid.embedUrl(),
                items, now);
    }

    private Media mediaRef(Long id) {
        return id == null ? null : media.getReferenceById(id);
    }

    private static List<Long> mediaIds(ProfileBlock block) {
        return Stream.concat(Stream.of(block.getMedia()), block.getItems().stream().map(ProfileBlockItem::getMedia))
                .filter(Objects::nonNull)
                .map(Media::getId)
                .toList();
    }

    private static BlockDto toDto(ProfileBlock b) {
        Long mediaId = b.getMedia() == null ? null : b.getMedia().getId();
        List<ItemDto> items = b.getItems().stream().map(i -> {
            Long id = i.getMedia() == null ? null : i.getMedia().getId();
            return new ItemDto(i.getLabel(), i.getValue(), id, id == null ? null : MediaController.url(id));
        }).toList();
        return new BlockDto(b.getId(), b.getType(), b.getTitle(), b.getBody(), mediaId,
                mediaId == null ? null : MediaController.url(mediaId), b.getCaption(), b.getEmbedUrl(), items);
    }
}
