package com.subtitlestudio.publish;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.photo.PhotoPostDto;
import com.subtitlestudio.photo.PhotoService;
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
import com.subtitlestudio.profile.ProfilePageDto;
import com.subtitlestudio.work.PersonDto;
import com.subtitlestudio.work.WorkCreditDto;
import com.subtitlestudio.work.WorkDto;
import com.subtitlestudio.work.WorkService;
import com.subtitlestudio.work.WorkSummaryDto;
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
    private final PhotoService photos;
    private final WorkService works;
    private final int fileWarning;

    @Autowired
    public SiteExporter(SubtitleService subtitles, VietsubService vietsub, PlaylistService playlists,
                        ProfileService profiles, MediaRepository media, SubtitleStudioProperties properties,
                        ObjectMapper mapper, NovelExporter novels, PhotoService photos, WorkService works) {
        this(subtitles, vietsub, playlists, profiles, media, properties, mapper, novels, photos, works,
                PublishService.FILE_WARNING);
    }

    SiteExporter(SubtitleService subtitles, VietsubService vietsub, PlaylistService playlists,
                 ProfileService profiles, MediaRepository media, SubtitleStudioProperties properties,
                 ObjectMapper mapper, NovelExporter novels, PhotoService photos, WorkService works, int fileWarning) {
        this.subtitles = subtitles;
        this.vietsub = vietsub;
        this.playlists = playlists;
        this.profiles = profiles;
        this.media = media;
        this.properties = properties;
        this.mapper = mapper;
        this.novels = novels;
        this.photos = photos;
        this.works = works;
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
        exportPhotos(dir, publicUrls);
        exportWorks(dir, publicUrls);
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
        ProfilePageDto page = profiles.page();
        write(dir.resolve("data/profiles.json"), new ProfilePageDto(publicProfile(page.group(), dir, publicUrls),
                page.members().stream().map(m -> publicProfile(m, dir, publicUrls)).toList()));
    }

    /** Posts whose image file is gone are left out; the others point at the copied /media/ file. */
    private void exportPhotos(Path dir, Map<Long, Optional<String>> publicUrls) {
        List<PhotoPostDto> exported = new java.util.ArrayList<>();
        for (PhotoPostDto p : photos.list()) {
            long mediaId = Long.parseLong(p.imageUrl().substring(p.imageUrl().lastIndexOf('/') + 1));
            String url = publicUrl(mediaId, dir, publicUrls);
            if (url == null) {
                log.warn("Photo post {} has no image file; left out of the public site", p.id());
                continue;
            }
            exported.add(new PhotoPostDto(p.id(), p.instagramUrl(), url, p.width(), p.height(), p.title(), p.takenOn(),
                    p.takenUntil(), p.source(), p.photoCount(), p.profiles()));
        }
        write(dir.resolve("data/photos.json"), exported);
    }

    /** The grid list and one file per work, every image on its public /media/ URL and no media ids. */
    private void exportWorks(Path dir, Map<Long, Optional<String>> publicUrls) {
        List<WorkSummaryDto> summaries = new java.util.ArrayList<>();
        for (WorkSummaryDto s : works.list()) {
            WorkDto w = works.get(s.id());
            String cover = publicUrl(w.coverMediaId(), dir, publicUrls);
            summaries.add(new WorkSummaryDto(w.id(), w.title(), cover, w.releaseDate(), w.category(), w.subcategory(),
                    w.profile()));
            List<WorkCreditDto> credits = w.credits().stream().map(c -> new WorkCreditDto(
                    new PersonDto(c.person().id(), c.person().name(), null,
                            publicUrl(c.person().avatarMediaId(), dir, publicUrls)),
                    c.role(), c.characterName())).toList();
            write(dir.resolve("data/works/" + w.id() + ".json"), new WorkDto(w.id(), w.title(), cover, w.releaseDate(),
                    w.category(), w.subcategory(), w.profile(), null, w.description(), w.links(), credits,
                    w.trailerVideoId()));
        }
        write(dir.resolve("data/works.json"), summaries);
    }

    /** Public shape of a profile: every image URL is the exported /media/ one and no media ids are left. */
    private ProfileDto publicProfile(ProfileDto profile, Path dir, Map<Long, Optional<String>> publicUrls) {
        List<BlockDto> blocks = profile.blocks().stream().map(b -> new BlockDto(b.id(), b.type(), b.title(),
                b.body(), null, publicUrl(b.mediaId(), dir, publicUrls), b.caption(), b.embedUrl(),
                b.items().stream().map(i -> new ItemDto(i.label(), i.value(), null,
                        publicUrl(i.mediaId(), dir, publicUrls))).toList())).toList();
        List<BannerImageDto> banner = profile.banner().stream().map(i -> new BannerImageDto(i.id(), null,
                publicUrl(i.mediaId(), dir, publicUrls), i.altText())).toList();
        return new ProfileDto(profile.slug(), profile.displayName(), profile.kind(), profile.tagline(),
                profile.fullName(), null, publicUrl(profile.portraitMediaId(), dir, publicUrls), profile.updatedAt(),
                blocks, banner);
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
