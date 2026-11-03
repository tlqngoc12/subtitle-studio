package com.subtitlestudio.profile;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads and edits profile blocks (spec section 5). Images a change leaves unused are deleted with it. */
@Service
@Transactional
public class ProfileService {

    private final ProfileRepository profiles;
    private final ProfileBlockRepository blocks;
    private final MediaRepository media;
    private final MediaService mediaService;
    private final ProfileBlockValidator validator;
    private final Clock clock;

    public ProfileService(ProfileRepository profiles, ProfileBlockRepository blocks, MediaRepository media,
                          MediaService mediaService, ProfileBlockValidator validator, Clock clock) {
        this.profiles = profiles;
        this.blocks = blocks;
        this.media = media;
        this.mediaService = mediaService;
        this.validator = validator;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ProfileSummary> list() {
        return profiles.findAllByOrderByIdAsc().stream()
                .map(p -> new ProfileSummary(p.getSlug(), p.getDisplayName()))
                .toList();
    }

    @Transactional(readOnly = true)
    public ProfileDto get(String slug) {
        Profile profile = profile(slug);
        List<BlockDto> dtos = blocks.findByProfileOrderByPositionAscIdAsc(profile).stream()
                .map(ProfileService::toDto)
                .toList();
        return new ProfileDto(profile.getSlug(), profile.getDisplayName(), profile.getUpdatedAt(), dtos);
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
            throw new InvalidBlockException(List.of(new FieldError("type", "Không đổi được loại khối")));
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
