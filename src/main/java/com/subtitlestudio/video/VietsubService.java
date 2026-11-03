package com.subtitlestudio.video;

import com.subtitlestudio.subtitle.Cue;
import com.subtitlestudio.subtitle.InvalidSrtException;
import com.subtitlestudio.subtitle.SrtEntry;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.subtitle.SrtWriter;
import com.subtitlestudio.url.UrlParser;
import java.text.Normalizer;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Stores a user-supplied Vietnamese .srt as a standalone subtitle track, played with the file's own timing.
 *
 * <p>The file is parsed and validated before any YouTube call, so a broken file never triggers a fetch.
 * Adding Vietsub replaces any previous Vietsub of the video.
 */
@Service
public class VietsubService {

    static final int MAX_TEXT_LENGTH = 1000;

    private final UrlParser urlParser;
    private final SrtParser srtParser;
    private final SrtWriter srtWriter;
    private final SubtitleService subtitleService;
    private final VideoRepository videos;
    private final ViCueRepository viCues;
    private final TransactionTemplate tx;
    private final Clock clock;

    public VietsubService(UrlParser urlParser, SrtParser srtParser, SrtWriter srtWriter, SubtitleService subtitleService,
                          VideoRepository videos, ViCueRepository viCues, TransactionTemplate tx, Clock clock) {
        this.urlParser = urlParser;
        this.srtParser = srtParser;
        this.srtWriter = srtWriter;
        this.subtitleService = subtitleService;
        this.videos = videos;
        this.viCues = viCues;
        this.tx = tx;
        this.clock = clock;
    }

    /** Adds (or replaces) the Vietsub of the video at {@code url}, importing the video first if needed. */
    public Video add(String url, byte[] srt) {
        String id = urlParser.parse(url);
        List<ViCue> cues = toCues(srtParser.parse(srt).entries());

        if (!videos.existsById(id)) {
            subtitleService.fetch(url);
        }
        return tx.execute(status -> {
            viCues.deleteByVideoId(id); // clears the persistence context, so load the video afterwards
            Video video = videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id));
            List<ViCueEntity> entities = new ArrayList<>(cues.size());
            for (int i = 0; i < cues.size(); i++) {
                ViCue c = cues.get(i);
                entities.add(new ViCueEntity(video, i, c.startMs(), c.endMs(), c.text()));
            }
            viCues.saveAll(entities);
            video.updateVietsub(cues.size(), clock.instant(), ViSource.MANUAL);
            return video;
        });
    }

    /** The stored Vietsub as a downloadable {@code {title}_{id}.vi.srt}. */
    @Transactional(readOnly = true)
    public SrtExport exportSrt(String id, boolean bom) {
        Video video = videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id));
        if (video.getViCueCount() == 0) {
            throw new NoVietsubException(id);
        }
        List<Cue> cues = viCues.findByVideo_IdOrderByIdxAsc(id).stream()
                .map(c -> c.toViCue())
                .map(c -> new Cue(c.startMs(), c.endMs(), c.text()))
                .toList();
        return new SrtExport(srtWriter.fileName(video.getTitle(), id, "vi"), srtWriter.toBytes(cues, bom));
    }

    public void clear(String id) {
        tx.executeWithoutResult(status -> {
            if (!videos.existsById(id)) {
                throw new VideoNotFoundException(id);
            }
            viCues.deleteByVideoId(id);
            videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id)).clearVietsub();
        });
    }

    @Transactional(readOnly = true)
    public List<ViCue> getCues(String id) {
        if (!videos.existsById(id)) {
            throw new VideoNotFoundException(id);
        }
        return viCues.findByVideo_IdOrderByIdxAsc(id).stream().map(ViCueEntity::toViCue).toList();
    }

    /** NFC text, drops empty or zero/negative-length lines, rejects over-long lines, sorts by start (stable). */
    private static List<ViCue> toCues(List<SrtEntry> entries) {
        List<ViCue> cues = new ArrayList<>(entries.size());
        for (SrtEntry e : entries) {
            String text = Normalizer.normalize(e.text(), Normalizer.Form.NFC);
            if (text.isBlank() || e.endMs() <= e.startMs()) {
                continue;
            }
            if (text.length() > MAX_TEXT_LENGTH) {
                throw new InvalidSrtException(
                        "Block " + e.index() + " is longer than " + MAX_TEXT_LENGTH + " characters");
            }
            cues.add(new ViCue(e.startMs(), e.endMs(), text));
        }
        if (cues.isEmpty()) {
            throw new InvalidSrtException("No subtitle text found");
        }
        cues.sort(Comparator.comparingLong(ViCue::startMs));
        return cues;
    }
}
