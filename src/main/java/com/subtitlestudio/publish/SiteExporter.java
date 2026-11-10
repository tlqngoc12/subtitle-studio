package com.subtitlestudio.publish;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.playlist.PlaylistDetail;
import com.subtitlestudio.playlist.PlaylistService;
import com.subtitlestudio.playlist.PlaylistSummary;
import com.subtitlestudio.profile.BannerImageDto;
import com.subtitlestudio.profile.BlockDto;
import com.subtitlestudio.profile.ImageType;
import com.subtitlestudio.profile.ItemDto;
import com.subtitlestudio.profile.Media;
import com.subtitlestudio.profile.MediaRepository;
import com.subtitlestudio.profile.ProfileDto;
import com.subtitlestudio.profile.ProfileService;
import com.subtitlestudio.profile.ProfileSummary;
import com.subtitlestudio.video.EditStatus;
import com.subtitlestudio.video.SubtitleService;
import com.subtitlestudio.video.ViCue;
import com.subtitlestudio.video.VideoDto;
import com.subtitlestudio.video.ViSource;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Writes the public site's data (spec section 4) into a directory: allowlisted JSON plus the images the
 * profiles and novels use, and the novels' drawn chapters ({@link NovelExporter}). Everything is exported again on
 * every publish.
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
    private final NovelExporter novels;
    private final int fileWarning;

    /** Cloudflare Pages Free allows 20,000 files per site; warn a little before. */
    static final int FILE_WARNING = 18_000;

    @Autowired
    public SiteExporter(SubtitleService subtitles, VietsubService vietsub, PlaylistService playlists,
                        ProfileService profiles, MediaRepository media, SubtitleStudioProperties properties,
                        ObjectMapper mapper, NovelExporter novels) {
        this(subtitles, vietsub, playlists, profiles, media, properties, mapper, novels, FILE_WARNING);
    }

    SiteExporter(SubtitleService subtitles, VietsubService vietsub, PlaylistService playlists,
                 ProfileService profiles, MediaRepository media, SubtitleStudioProperties properties,
                 ObjectMapper mapper, NovelExporter novels, int fileWarning) {
        this.subtitles = subtitles;
        this.vietsub = vietsub;
        this.playlists = playlists;
        this.profiles = profiles;
        this.media = media;
        this.properties = properties;
        this.mapper = mapper;
        this.novels = novels;
        this.fileWarning = fileWarning;
    }

    public record SiteInfo(Instant publishedAt, int year) {}

    public record VideoFile(PublicVideo video, List<ViCue> vietsub) {}

    public void export(Path dir, Instant publishedAt) {
        write(dir.resolve("data/site.json"), new SiteInfo(publishedAt, publishedAt.atZone(ZoneOffset.UTC).getYear()));

        List<PublicVideo> videos = subtitles.list().stream()
                .map(VideoDto::from)
                .filter(SiteExporter::isPublic)
                .map(PublicVideo::from)
                .sorted(NEWEST_VIETSUB_FIRST)
                .toList();
        write(dir.resolve("data/videos.json"), videos);
        for (PublicVideo v : videos) {
            write(dir.resolve("data/videos/" + v.id() + ".json"), new VideoFile(v, vietsub.getCues(v.id())));
        }

        exportPlaylists(dir);
        Map<Long, Optional<String>> publicUrls = new HashMap<>();
        exportProfiles(dir, publicUrls);
        novels.export(dir, id -> publicUrl(id, dir, publicUrls), this::write);
        warnAboutFileCount(dir);
    }

    private void warnAboutFileCount(Path dir) {
        try (java.util.stream.Stream<Path> files = Files.walk(dir)) {
            long count = files.filter(Files::isRegularFile).count();
            if (count > fileWarning) {
                log.warn("Public site has {} files; Cloudflare Pages Free allows 20,000.", count);
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Could not count the public site's files", e);
        }
    }

    /** Guests only see videos whose Vietsub is finished (DONE, which only a MANUAL Vietsub can be). */
    private static boolean isPublic(VideoDto v) {
        return v.viCueCount() > 0 && v.viSource() == ViSource.MANUAL && v.editStatus() == EditStatus.DONE;
    }

    private void exportPlaylists(Path dir) {
        List<PublicPlaylistSummary> summaries = new java.util.ArrayList<>();
        for (PlaylistSummary s : playlists.list(null)) {
            PlaylistDetail detail = playlists.get(s.id());
            List<PublicVideo> videos = detail.videos().stream()
                    .filter(SiteExporter::isPublic)
                    .map(PublicVideo::from)
                    .toList();
            if (videos.isEmpty()) {
                continue; // nothing a guest could watch: leave the playlist out
            }
            write(dir.resolve("data/playlists/" + s.id() + ".json"),
                    new PublicPlaylistDetail(detail.id(), detail.name(), detail.description(), detail.updatedAt(), videos));
            summaries.add(new PublicPlaylistSummary(s.id(), s.name(), s.description(), videos.size(),
                    videos.get(0).thumbnailUrl(), s.updatedAt()));
        }
        write(dir.resolve("data/playlists.json"), summaries);
    }

    private void exportProfiles(Path dir, Map<Long, Optional<String>> publicUrls) {
        List<ProfileSummary> list = profiles.list();
        write(dir.resolve("data/profiles.json"), list);
        for (ProfileSummary summary : list) {
            ProfileDto profile = profiles.get(summary.slug());
            List<BlockDto> blocks = profile.blocks().stream().map(b -> new BlockDto(b.id(), b.type(), b.title(),
                    b.body(), b.mediaId(), publicUrl(b.mediaId(), dir, publicUrls), b.caption(), b.embedUrl(),
                    b.items().stream().map(i -> new ItemDto(i.label(), i.value(), i.mediaId(),
                            publicUrl(i.mediaId(), dir, publicUrls))).toList())).toList();
            List<BannerImageDto> banner = profile.banner().stream().map(i -> new BannerImageDto(i.id(), null,
                    publicUrl(i.mediaId(), dir, publicUrls), i.altText())).toList();
            write(dir.resolve("data/profiles/" + profile.slug() + ".json"),
                    new ProfileDto(profile.slug(), profile.displayName(), profile.updatedAt(), blocks, banner));
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
