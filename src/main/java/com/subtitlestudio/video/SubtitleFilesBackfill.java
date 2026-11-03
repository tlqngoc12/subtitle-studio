package com.subtitlestudio.video;

import com.subtitlestudio.subtitle.Cue;
import com.subtitlestudio.subtitle.SrtWriter;
import java.util.List;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * At startup, writes the .srt files that videos stored before Phase 4 do not have yet. A rebuilt
 * vi_manual.srt comes from the database, so it is not the original upload byte for byte.
 */
@Component
public class SubtitleFilesBackfill {

    private final VideoRepository videos;
    private final CueRepository cues;
    private final ViCueRepository viCues;
    private final SrtWriter srtWriter;
    private final SubtitleFileStore files;

    public SubtitleFilesBackfill(VideoRepository videos, CueRepository cues, ViCueRepository viCues,
                                 SrtWriter srtWriter, SubtitleFileStore files) {
        this.videos = videos;
        this.cues = cues;
        this.viCues = viCues;
        this.srtWriter = srtWriter;
        this.files = files;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional(readOnly = true)
    public void run() {
        for (Video video : videos.findAll()) {
            String id = video.getId();
            if (!files.hasEnglish(id)) {
                List<Cue> english = cues.findByVideo_IdOrderByIdxAsc(id).stream().map(CueEntity::toCue).toList();
                files.writeEnglish(id, srtWriter.toBytes(english, false));
            }
            if (video.getViSource() == ViSource.MANUAL && !files.hasViManual(id)) {
                List<Cue> vietsub = viCues.findByVideo_IdOrderByIdxAsc(id).stream()
                        .map(ViCueEntity::toViCue)
                        .map(c -> new Cue(c.startMs(), c.endMs(), c.text()))
                        .toList();
                files.writeViManual(id, srtWriter.toBytes(vietsub, false));
            }
        }
    }
}
