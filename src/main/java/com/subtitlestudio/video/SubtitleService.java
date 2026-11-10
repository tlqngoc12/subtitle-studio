package com.subtitlestudio.video;

import org.springframework.context.ApplicationEventPublisher;
import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.subtitle.CaptionNormalizer;
import com.subtitlestudio.subtitle.Cue;
import com.subtitlestudio.subtitle.SubtitleTrack;
import com.subtitlestudio.subtitle.SrtWriter;
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

    private final ApplicationEventPublisher events;

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
    private final SrtWriter srtWriter;
    private final SubtitleFileStore files;

    public SubtitleService(UrlParser urlParser, YtDlpClient ytDlp, SubtitleTrackSelector trackSelector,
                           VttParser vttParser, CaptionNormalizer normalizer, VideoRepository videos,
                           CueRepository cues, ViCueRepository viCues, SubtitleStudioProperties properties,
                           TransactionTemplate tx,
                           Clock clock, SrtWriter srtWriter, SubtitleFileStore files,
                           ApplicationEventPublisher events) {
        this.events = events;
        this.srtWriter = srtWriter;
        this.files = files;
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
        files.writeEnglish(id, srtWriter.toBytes(imported.cues(), false));
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

    /** Removes the video, its cues and all its subtitle files (.vtt and .srt). */
    public void delete(String id) {
        tx.executeWithoutResult(status -> {
            if (!videos.existsById(id)) {
                throw new VideoNotFoundException(id);
            }
            events.publishEvent(new VideoRemovalEvent(id)); // playlist items reference the video (FK)
            viCues.deleteByVideoId(id); // Vietsub rows reference the video too (FK)
            cues.deleteByVideoId(id); // clears the persistence context
            videos.deleteById(id);
        });
        files.deleteAll(id);
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
        video.setDescription(info.description());
    }

    private void saveCues(Video video, List<Cue> normalized) {
        List<CueEntity> entities = new ArrayList<>(normalized.size());
        for (int i = 0; i < normalized.size(); i++) {
            Cue c = normalized.get(i);
            entities.add(new CueEntity(video, i, c.startMs(), c.endMs(), c.text()));
        }
        cues.saveAll(entities);
    }

    private record Imported(VideoInfo info, SubtitleTrack track, List<Cue> cues) {}
}
