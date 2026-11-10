package com.subtitlestudio.translate;

import com.subtitlestudio.subtitle.SrtEntry;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.video.CueEntity;
import com.subtitlestudio.video.CueRepository;
import com.subtitlestudio.video.SubtitleFileStore;
import com.subtitlestudio.video.ViCueEntity;
import com.subtitlestudio.video.ViCueRepository;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoRepository;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the approved English to Vietnamese examples for a translation: from the latest finished (DONE, hand
 * made) videos that were translated with the same profile, so one profile stands for one series.
 */
@Service
public class ExampleSource {

    /** How many earlier videos feed the examples. */
    static final int MAX_VIDEOS = 3;

    private static final Logger log = LoggerFactory.getLogger(ExampleSource.class);

    private final VideoRepository videos;
    private final CueRepository cues;
    private final ViCueRepository viCues;
    private final SubtitleFileStore files;
    private final SrtParser srtParser;

    public ExampleSource(VideoRepository videos, CueRepository cues, ViCueRepository viCues,
                         SubtitleFileStore files, SrtParser srtParser) {
        this.videos = videos;
        this.cues = cues;
        this.viCues = viCues;
        this.files = files;
        this.srtParser = srtParser;
    }

    /** Examples for a video about to be translated with {@code profile}; empty when there are none. */
    @Transactional(readOnly = true)
    public List<ExamplePair> examplesFor(String profile, String excludeVideoId) {
        List<Video> sources = videos.findExampleVideos(profile, excludeVideoId, PageRequest.of(0, MAX_VIDEOS));
        List<List<ExampleSelector.Candidate>> perVideo = new ArrayList<>();
        for (Video video : sources) {
            perVideo.add(candidates(video.getId()));
        }
        ExampleSelector.Result result = ExampleSelector.select(perVideo);
        log.info("examples: {} pairs from {} videos ({} corrected)", result.pairs().size(), result.videos(),
                result.corrected());
        return result.pairs();
    }

    private List<ExampleSelector.Candidate> candidates(String videoId) {
        Map<Long, String> english = new HashMap<>();
        for (CueEntity cue : cues.findByVideo_IdOrderByIdxAsc(videoId)) {
            english.putIfAbsent(cue.getStartMs(), cue.getTextEn());
        }
        Map<Long, String> aiVersion = aiVersion(videoId);
        List<ExampleSelector.Candidate> out = new ArrayList<>();
        for (ViCueEntity vi : viCues.findByVideo_IdOrderByIdxAsc(videoId)) {
            var cue = vi.toViCue();
            String en = english.get(cue.startMs());
            if (en == null) {
                continue;
            }
            String ai = aiVersion.get(cue.startMs());
            out.add(new ExampleSelector.Candidate(en, cue.text(), ai != null && !same(ai, cue.text())));
        }
        return out;
    }

    /** The first Gemini translation (start time to text); empty when the file is missing or unreadable. */
    private Map<Long, String> aiVersion(String videoId) {
        Path file = files.path(videoId, "vi_auto");
        Map<Long, String> byStart = new HashMap<>();
        if (!Files.isRegularFile(file)) {
            return byStart;
        }
        try {
            for (SrtEntry entry : srtParser.parse(Files.readAllBytes(file)).entries()) {
                byStart.putIfAbsent(entry.startMs(), entry.text());
            }
        } catch (IOException | RuntimeException e) {
            log.warn("Could not read the AI version of {}: {}", videoId, e.getClass().getSimpleName());
            byStart.clear();
        }
        return byStart;
    }

    private static boolean same(String a, String b) {
        return a.strip().replaceAll("\\s+", " ").equals(b.strip().replaceAll("\\s+", " "));
    }
}
