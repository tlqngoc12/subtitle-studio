package com.subtitlestudio.publish;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.playlist.PlaylistDetail;
import com.subtitlestudio.playlist.PlaylistService;
import com.subtitlestudio.playlist.PlaylistSummary;
import com.subtitlestudio.profile.BlockDto;
import com.subtitlestudio.profile.ImageType;
import com.subtitlestudio.profile.ItemDto;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.ProfileDto;
import com.subtitlestudio.profile.ProfileService;
import com.subtitlestudio.profile.ProfileSummary;
import com.subtitlestudio.video.SubtitleService;
import com.subtitlestudio.video.ViCue;
import com.subtitlestudio.video.VideoDto;
import com.subtitlestudio.video.VietsubService;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Writes the public site's data (spec section 4) into a directory: allowlisted JSON plus the images the
 * profiles use. Everything is exported again on every publish.
 */
@Component
public class SiteExporter {

    private static final Logger log = LoggerFactory.getLogger(SiteExporter.class);
    private static final Comparator<PublicVideo> NEWEST_VIETSUB_FIRST = Comparator.comparing(
            PublicVideo::viUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder()));

    private final SubtitleService subtitles;
    private final VietsubService vietsub;
    private final PlaylistService playlists;
    private final ProfileService profiles;
    private final MediaRepository media;
    private final SubtitleStudioProperties properties;
    private final ObjectMapper mapper;

    public SiteExporter(SubtitleService subtitles, VietsubService vietsub, PlaylistService playlists,
                        ProfileService profiles, MediaRepository media, SubtitleStudioProperties properties,
                        ObjectMapper mapper) {
        this.subtitles = subtitles;
        this.vietsub = vietsub;
        this.playlists = playlists;
        this.profiles = profiles;
        this.media = media;
        this.properties = properties;
        this.mapper = mapper;
    }

    public record SiteInfo(Instant publishedAt, int year) {}

    public record VideoFile(PublicVideo video, List<ViCue> vietsub) {}

    public void export(Path dir, Instant publishedAt) {
        write(dir.resolve("data/site.json"), new SiteInfo(publishedAt, publishedAt.atZone(ZoneOffset.UTC).getYear()));

        List<PublicVideo> videos = subtitles.list().stream()
                .map(VideoDto::from)
                .map(PublicVideo::from)
                .filter(v -> v.viCueCount() > 0)
                .sorted(NEWEST_VIETSUB_FIRST)
                .toList();
        write(dir.resolve("data/videos.json"), videos);
        for (PublicVideo v : videos) {
            write(dir.resolve("data/videos/" + v.id() + ".json"), new VideoFile(v, vietsub.getCues(v.id())));
        }

        exportPlaylists(dir);
        exportProfiles(dir);
    }

    private void exportPlaylists(Path dir) {
        List<PublicPlaylistSummary> summaries = new java.util.ArrayList<>();
        for (PlaylistSummary s : playlists.list(null)) {
            PlaylistDetail detail = playlists.get(s.id());
            List<PublicVideo> videos = detail.videos().stream()
                    .map(PublicVideo::from)
                    .filter(v -> v.viCueCount() > 0)
                    .toList();
            write(dir.resolve("data/playlists/" + s.id() + ".json"),
                    new PublicPlaylistDetail(detail.id(), detail.name(), detail.description(), detail.updatedAt(), videos));
            summaries.add(new PublicPlaylistSummary(s.id(), s.name(), s.description(), videos.size(),
                    videos.isEmpty() ? null : videos.get(0).thumbnailUrl(), s.updatedAt()));
        }
        write(dir.resolve("data/playlists.json"), summaries);
    }

    private void exportProfiles(Path dir) {
        List<ProfileSummary> list = profiles.list();
        write(dir.resolve("data/profiles.json"), list);
        Map<Long, Optional<String>> publicUrls = new HashMap<>();
        for (ProfileSummary summary : list) {
            ProfileDto profile = profiles.get(summary.slug());
            List<BlockDto> blocks = profile.blocks().stream().map(b -> new BlockDto(b.id(), b.type(), b.title(),
                    b.body(), b.mediaId(), publicUrl(b.mediaId(), dir, publicUrls), b.caption(), b.embedUrl(),
                    b.items().stream().map(i -> new ItemDto(i.label(), i.value(), i.mediaId(),
                            publicUrl(i.mediaId(), dir, publicUrls))).toList())).toList();
            write(dir.resolve("data/profiles/" + profile.slug() + ".json"),
                    new ProfileDto(profile.slug(), profile.displayName(), profile.updatedAt(), blocks));
        }
    }

    /** Copies the image once and returns its public URL; null when there is no image or its file is gone. */
    private String publicUrl(Long mediaId, Path dir, Map<Long, Optional<String>> done) {
        if (mediaId == null) {
            return null;
        }
        return done.computeIfAbsent(mediaId, id -> copyImage(id, dir)).orElse(null);
    }

    private Optional<String> copyImage(long id, Path dir) {
        Optional<Media> found = media.findById(id);
        Optional<ImageType> type = found.flatMap(m -> ImageType.fromContentType(m.getContentType()));
        if (found.isEmpty() || type.isEmpty()) {
            log.warn("Media {} is missing on disk; left out of the public site", id);
            return Optional.empty();
        }
        String name = found.get().getStorageKey() + "." + type.get().extension();
        Path source = properties.mediaDir().resolve(name);
        if (!Files.isRegularFile(source)) {
            log.warn("Media {} is missing on disk; left out of the public site", id);
            return Optional.empty();
        }
        try {
            Path target = dir.resolve("media").resolve(name);
            Files.createDirectories(target.getParent());
            Files.copy(source, target);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not copy media " + id, e);
        }
        return Optional.of("/media/" + name);
    }

    private void write(Path file, Object value) {
        try {
            Files.createDirectories(file.getParent());
            mapper.writeValue(file.toFile(), value);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not write " + file, e);
        }
    }
}
