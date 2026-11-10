package com.subtitlestudio.translate;

import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoRepository;
import java.util.ArrayList;
import java.util.List;
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
    private final CorrectionReader reader;

    public ExampleSource(VideoRepository videos, CorrectionReader reader) {
        this.videos = videos;
        this.reader = reader;
    }

    /** Examples for a video about to be translated with {@code profile}; empty when there are none. */
    @Transactional(readOnly = true)
    public List<ExamplePair> examplesFor(String profile, String excludeVideoId) {
        List<Video> sources = videos.findExampleVideos(profile, excludeVideoId, PageRequest.of(0, MAX_VIDEOS));
        List<List<ExampleSelector.Candidate>> perVideo = new ArrayList<>();
        for (Video video : sources) {
            perVideo.add(reader.read(video.getId()).stream()
                    .map(c -> new ExampleSelector.Candidate(c.en(), c.vi(), c.corrected()))
                    .toList());
        }
        ExampleSelector.Result result = ExampleSelector.select(perVideo);
        log.info("examples: {} pairs from {} videos ({} corrected)", result.pairs().size(), result.videos(),
                result.corrected());
        return result.pairs();
    }
}
