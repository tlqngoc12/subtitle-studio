package com.subtitlestudio.video;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.subtitle.CaptionNormalizer;
import com.subtitlestudio.subtitle.Cue;
import com.subtitlestudio.subtitle.SubtitleTrack;
import com.subtitlestudio.subtitle.SubtitleTrackSelector;
import com.subtitlestudio.subtitle.VttParser;
import com.subtitlestudio.url.UrlParser;
import com.subtitlestudio.ytdlp.VideoInfo;
import com.subtitlestudio.ytdlp.YtDlpClient;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Orchestrates the Phase 1 pipeline: URL → yt-dlp → track selection → VTT parse → normalize → H2.
 *
 * <p>yt-dlp calls (network, up to the configured timeout) run outside any DB transaction; only the
 * final write is transactional, so a slow download never holds a connection or leaves partial data.
 */
@Service
public class SubtitleService {

    private static final Logger log = LoggerFactory.getLogger(SubtitleService.class);

    private final UrlParser urlParser;
    private final YtDlpClient ytDlp;
    private final SubtitleTrackSelector trackSelector;
    private final VttParser vttParser;
    private final CaptionNormalizer normalizer;
    private final VideoRepository videos;
    private final CueRepository cues;
    private final ViCueRepository viCues;
    private final Path subsDir;
    private final TransactionTemplate tx;
    private final Clock clock;

    public SubtitleService(UrlParser urlParser, YtDlpClient ytDlp, SubtitleTrackSelector trackSelector,
                           VttParser vttParser, CaptionNormalizer normalizer, VideoRepository videos,
                           CueRepository cues, ViCueRepository viCues, SubtitleStudioProperties properties,
                           TransactionTemplate tx,
                           Clock clock) {
        this.urlParser = urlParser;
        this.ytDlp = ytDlp;
        this.trackSelector = trackSelector;
        this.vttParser = vttParser;
        this.normalizer = normalizer;
        this.videos = videos;
        this.cues = cues;
        this.viCues = viCues;
        this.subsDir = properties.subsDir();
        this.tx = tx;
        this.clock = clock;
    }

    /** Returns the stored video for this URL, importing it from YouTube first if needed. */
    public FetchResult fetch(String url) {
        String id = urlParser.parse(url);
        var existing = videos.findById(id);
        if (existing.isPresent()) {
            return new FetchResult(existing.get(), false);
        }
        Imported imported = download(id);
        Video saved = tx.execute(status -> {
            Video video = new Video(id);
            apply(video, imported);
            // Assigned id => save() merges and returns a managed copy; cues must reference that copy.
            Video managed = videos.save(video);
            saveCues(managed, imported.cues());
            return managed;
        });
        return new FetchResult(saved, true);
    }

    @Transactional(readOnly = true)
    public Video get(String id) {
        return videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id));
    }

    @Transactional(readOnly = true)
    public List<Video> list() {
        return videos.findAllByOrderByFetchedAtDesc();
    }

    @Transactional(readOnly = true)
    public List<Cue> getCues(String id) {
        if (!videos.existsById(id)) {
            throw new VideoNotFoundException(id);
        }
        return cues.findByVideo_IdOrderByIdxAsc(id).stream().map(CueEntity::toCue).toList();
    }

    /** Re-downloads subtitles from YouTube and replaces the stored cues. Existing data survives a failure. */
    public Video refresh(String id) {
        String oldLang = get(id).getSubLang();
        Imported imported = download(id);
        Video refreshed = tx.execute(status -> {
            if (!videos.existsById(id)) {
                throw new VideoNotFoundException(id);
            }
            cues.deleteByVideoId(id); // clears the persistence context, so load the video afterwards
            Video video = videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id));
            apply(video, imported);
            saveCues(video, imported.cues());
            return video;
        });
        if (!oldLang.equals(imported.track().lang())) {
            deleteVttQuietly(id, oldLang);
        }
        return refreshed;
    }

    /** Removes the video, its cues and its downloaded .vtt file. */
    public void delete(String id) {
        String lang = tx.execute(status -> {
            String subLang = videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id)).getSubLang();
            viCues.deleteByVideoId(id); // Vietsub rows reference the video too (FK)
            cues.deleteByVideoId(id); // clears the persistence context
            videos.deleteById(id);
            return subLang;
        });
        deleteVttQuietly(id, lang);
    }

    private Imported download(String id) {
        VideoInfo info = ytDlp.fetchInfo(id);
        SubtitleTrack track = trackSelector.select(info);
        Path vtt = ytDlp.downloadVtt(id, track, subsDir);
        String content;
        try {
            content = Files.readString(vtt, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + vtt, e);
        }
        List<Cue> normalized = normalizer.normalize(vttParser.parse(content), track.source());
        return new Imported(info, track, normalized);
    }

    private void apply(Video video, Imported imported) {
        VideoInfo info = imported.info();
        video.update(info.title(), info.channel(), info.durationSec(), imported.track().lang(),
                imported.track().source(), imported.cues().size(), clock.instant());
    }

    private void saveCues(Video video, List<Cue> normalized) {
        List<CueEntity> entities = new ArrayList<>(normalized.size());
        for (int i = 0; i < normalized.size(); i++) {
            Cue c = normalized.get(i);
            entities.add(new CueEntity(video, i, c.startMs(), c.endMs(), c.text()));
        }
        cues.saveAll(entities);
    }

    private void deleteVttQuietly(String id, String lang) {
        Path file = subsDir.resolve(id + "." + lang + ".vtt");
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            // The DB is the source of truth; a leftover debug file is harmless.
            log.warn("Could not delete {}: {}", file, e.getMessage());
        }
    }

    private record Imported(VideoInfo info, SubtitleTrack track, List<Cue> cues) {}
}
