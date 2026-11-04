package com.subtitlestudio.playlist;

import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoDto;
import com.subtitlestudio.video.VideoNotFoundException;
import com.subtitlestudio.video.VideoRepository;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Playlists of videos that have Vietsub. Positions are always rewritten to 1..n, so the order never has gaps
 * (spec section 3).
 */
@Service
@Transactional(readOnly = true)
public class PlaylistService {

    static final int NAME_MAX = 100;
    static final int DESCRIPTION_MAX = 1000;

    private final PlaylistRepository playlists;
    private final PlaylistItemRepository items;
    private final VideoRepository videos;
    private final Clock clock;

    public PlaylistService(PlaylistRepository playlists, PlaylistItemRepository items, VideoRepository videos,
                           Clock clock) {
        this.playlists = playlists;
        this.items = items;
        this.videos = videos;
        this.clock = clock;
    }

    /** All playlists, most recently changed first; with a video id, each says whether it holds that video. */
    public List<PlaylistSummary> list(String videoId) {
        Set<Long> holding = videoId == null ? Set.of() : items.findByVideo_Id(videoId).stream()
                .map(i -> i.getPlaylist().getId()).collect(Collectors.toSet());
        return playlists.findAllByOrderByUpdatedAtDesc().stream().map(p -> {
            List<PlaylistItem> ordered = items.findByPlaylist_IdOrderByPositionAsc(p.getId());
            String thumbnail = ordered.isEmpty() ? null : VideoDto.from(ordered.get(0).getVideo()).thumbnailUrl();
            Boolean contains = videoId == null ? null : holding.contains(p.getId());
            return new PlaylistSummary(p.getId(), p.getName(), p.getDescription(), ordered.size(), thumbnail,
                    p.getUpdatedAt(), contains);
        }).toList();
    }

    @Transactional
    public PlaylistDetail create(String name, String description) {
        List<FieldError> errors = new ArrayList<>();
        String n = checkName(name, errors);
        String d = checkDescription(description, errors);
        if (!errors.isEmpty()) {
            throw new InvalidPlaylistException(errors);
        }
        Playlist p = playlists.save(new Playlist(n, d, clock.instant()));
        return detail(p);
    }

    public PlaylistDetail get(long id) {
        return detail(find(id));
    }

    /** Changes the name and/or description; a null argument keeps that field. */
    @Transactional
    public PlaylistDetail update(long id, String name, String description) {
        Playlist p = find(id);
        List<FieldError> errors = new ArrayList<>();
        String n = name == null ? p.getName() : checkName(name, errors);
        String d = description == null ? p.getDescription() : checkDescription(description, errors);
        if (!errors.isEmpty()) {
            throw new InvalidPlaylistException(errors);
        }
        p.rename(n, d, clock.instant());
        return detail(p);
    }

    @Transactional
    public void delete(long id) {
        Playlist p = find(id);
        items.deleteByPlaylistId(p.getId());
        playlists.deleteById(p.getId());
    }

    /** Appends the video; a video already in the playlist keeps its position. */
    @Transactional
    public PlaylistDetail addVideo(long id, String videoId) {
        Playlist p = find(id);
        Video v = videos.findById(videoId).orElseThrow(() -> new VideoNotFoundException(videoId));
        if (v.getViCueCount() <= 0) {
            throw new VideoHasNoVietsubException(videoId);
        }
        if (items.findByPlaylist_IdAndVideo_Id(p.getId(), videoId).isEmpty()) {
            int next = (int) items.countByPlaylist_Id(p.getId()) + 1;
            items.save(new PlaylistItem(p, v, next));
            p.touch(clock.instant());
        }
        return detail(p);
    }

    /** Removes the video and closes the gap; removing a video that is not there does nothing. */
    @Transactional
    public void removeVideo(long id, String videoId) {
        Playlist p = find(id);
        items.findByPlaylist_IdAndVideo_Id(p.getId(), videoId).ifPresent(item -> {
            items.delete(item);
            items.flush();
            renumber(p.getId());
            p.touch(clock.instant());
        });
    }

    /** Saves a new order; the ids must be exactly the videos in the playlist, each once. */
    @Transactional
    public PlaylistDetail reorder(long id, List<String> videoIds) {
        Playlist p = find(id);
        List<PlaylistItem> current = items.findByPlaylist_IdOrderByPositionAsc(p.getId());
        if (videoIds == null || videoIds.stream().anyMatch(Objects::isNull)
                || new LinkedHashSet<>(videoIds).size() != videoIds.size()
                || videoIds.size() != current.size()) {
            throw new InvalidPlaylistOrderException();
        }
        Map<String, PlaylistItem> byVideo = current.stream()
                .collect(Collectors.toMap(i -> i.getVideo().getId(), Function.identity()));
        if (!byVideo.keySet().equals(new HashSet<>(videoIds))) {
            throw new InvalidPlaylistOrderException();
        }
        for (int i = 0; i < videoIds.size(); i++) {
            byVideo.get(videoIds.get(i)).moveTo(i + 1);
        }
        p.touch(clock.instant());
        return detail(p);
    }

    /** Takes a video out of every playlist (its Vietsub or the video itself is being deleted). */
    @Transactional
    public void removeVideoEverywhere(String videoId) {
        List<PlaylistItem> holding = items.findByVideo_Id(videoId);
        if (holding.isEmpty()) {
            return;
        }
        List<Playlist> touched = holding.stream().map(PlaylistItem::getPlaylist).distinct().toList();
        items.deleteAll(holding);
        items.flush();
        for (Playlist p : touched) {
            renumber(p.getId());
            p.touch(clock.instant());
        }
    }

    private void renumber(Long playlistId) {
        List<PlaylistItem> ordered = items.findByPlaylist_IdOrderByPositionAsc(playlistId);
        for (int i = 0; i < ordered.size(); i++) {
            ordered.get(i).moveTo(i + 1);
        }
    }

    private Playlist find(long id) {
        return playlists.findById(id).orElseThrow(() -> new PlaylistNotFoundException(id));
    }

    private PlaylistDetail detail(Playlist p) {
        List<VideoDto> ordered = items.findByPlaylist_IdOrderByPositionAsc(p.getId()).stream()
                .map(i -> VideoDto.from(i.getVideo())).toList();
        return new PlaylistDetail(p.getId(), p.getName(), p.getDescription(), p.getUpdatedAt(), ordered);
    }

    private static String checkName(String name, List<FieldError> errors) {
        String n = name == null ? "" : name.strip();
        if (n.isEmpty()) {
            errors.add(new FieldError("name", "Name is required"));
        } else if (n.length() > NAME_MAX) {
            errors.add(new FieldError("name", "Name must be at most " + NAME_MAX + " characters"));
        }
        return n;
    }

    /** Blank becomes null: Oracle stores '' as NULL anyway. */
    private static String checkDescription(String description, List<FieldError> errors) {
        String d = description == null ? "" : description.strip();
        if (d.length() > DESCRIPTION_MAX) {
            errors.add(new FieldError("description", "Description must be at most " + DESCRIPTION_MAX + " characters"));
        }
        return d.isEmpty() ? null : d;
    }
}
