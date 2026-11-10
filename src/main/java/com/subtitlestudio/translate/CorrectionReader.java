package com.subtitlestudio.translate;

import com.subtitlestudio.subtitle.SrtEntry;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.video.CueEntity;
import com.subtitlestudio.video.CueRepository;
import com.subtitlestudio.video.SubtitleFileStore;
import com.subtitlestudio.video.ViCueEntity;
import com.subtitlestudio.video.ViCueRepository;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Reads a video's lines as English / AI version / final Vietnamese triples, matched by start time. Shared by the
 * translation examples ({@link ExampleSource}) and the profile analysis.
 */
@Component
public class CorrectionReader {

    /** One line: the English, the AI's first Vietnamese (null when unknown), and the final Vietnamese. */
    public record Correction(String en, String ai, String vi) {

        /** True when the translator changed the AI's line (compared after collapsing whitespace). */
        public boolean corrected() {
            return ai != null && !same(ai, vi);
        }
    }

    private static final Logger log = LoggerFactory.getLogger(CorrectionReader.class);

    private final CueRepository cues;
    private final ViCueRepository viCues;
    private final SubtitleFileStore files;
    private final SrtParser srtParser;

    public CorrectionReader(CueRepository cues, ViCueRepository viCues, SubtitleFileStore files, SrtParser srtParser) {
        this.cues = cues;
        this.viCues = viCues;
        this.files = files;
        this.srtParser = srtParser;
    }

    /** Every final Vietnamese line that has an English line at the same start, in timeline order. */
    public List<Correction> read(String videoId) {
        Map<Long, String> english = new HashMap<>();
        for (CueEntity cue : cues.findByVideo_IdOrderByIdxAsc(videoId)) {
            english.putIfAbsent(cue.getStartMs(), cue.getTextEn());
        }
        Map<Long, String> aiVersion = aiVersion(videoId);
        List<Correction> out = new ArrayList<>();
        for (ViCueEntity vi : viCues.findByVideo_IdOrderByIdxAsc(videoId)) {
            var cue = vi.toViCue();
            String en = english.get(cue.startMs());
            if (en != null) {
                out.add(new Correction(en, aiVersion.get(cue.startMs()), cue.text()));
            }
        }
        return out;
    }

    /** Only the lines the translator changed after the AI. Empty when the AI version is missing or unreadable. */
    public List<Correction> readCorrected(String videoId) {
        return read(videoId).stream().filter(Correction::corrected).toList();
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
        return a.strip().replaceAll("\s+", " ").equals(b.strip().replaceAll("\s+", " "));
    }
}
