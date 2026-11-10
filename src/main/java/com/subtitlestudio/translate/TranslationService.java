package com.subtitlestudio.translate;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.video.CueEntity;
import com.subtitlestudio.video.CueRepository;
import com.subtitlestudio.video.TranslationStatus;
import com.subtitlestudio.video.ViCue;
import com.subtitlestudio.video.ViSource;
import com.subtitlestudio.video.Video;
import com.subtitlestudio.video.VideoNotFoundException;
import com.subtitlestudio.video.VideoRepository;
import com.subtitlestudio.video.VietsubService;
import com.subtitlestudio.ytdlp.YtDlpClient;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Translates a video's English subtitles to an AUTO Vietsub with Gemini, in the background.
 *
 * <p>Rules: never over a MANUAL Vietsub; one translation per video at a time (guarded by a conditional
 * UPDATE); from Get Engsub only when the video has no Vietsub yet; status and errors live in the database.
 */
@Service
public class TranslationService {

    static final String INTERRUPTED = "Interrupted by an app restart, translate again.";
    private static final int MAX_ERROR_LENGTH = 500;
    /** Lines of the previous part sent along as context to the next one. */
    static final int CONTEXT_LINES = 8;
    private static final Logger log = LoggerFactory.getLogger(TranslationService.class);

    private final SubtitleStudioProperties.Gemini gemini;
    private final PromptProfileStore profiles;
    private final GeminiTranslator translator;
    private final VideoRepository videos;
    private final CueRepository cues;
    private final VietsubService vietsub;
    private final TransactionTemplate tx;
    private final Executor executor;
    private final ExampleSource exampleSource;
    private final YtDlpClient ytDlp;
    private final PartialTranslationStore partials;
    /** The model being asked right now, per video that is TRANSLATING; removed when the run ends. */
    private final ConcurrentHashMap<String, String> activeModel = new ConcurrentHashMap<>();
    /** "2/3" while part 2 of 3 of a long video is being translated; absent for one-part videos. */
    private final ConcurrentHashMap<String, String> activePart = new ConcurrentHashMap<>();

    public TranslationService(SubtitleStudioProperties properties, PromptProfileStore profiles,
                              GeminiTranslator translator, VideoRepository videos, CueRepository cues,
                              VietsubService vietsub, TransactionTemplate tx,
                              @Qualifier("translationExecutor") Executor executor,
                              ExampleSource exampleSource, YtDlpClient ytDlp, PartialTranslationStore partials) {
        this.gemini = properties.gemini();
        this.profiles = profiles;
        this.translator = translator;
        this.videos = videos;
        this.cues = cues;
        this.vietsub = vietsub;
        this.tx = tx;
        this.executor = executor;
        this.exampleSource = exampleSource;
        this.ytDlp = ytDlp;
        this.partials = partials;
    }

    /**
     * After Get Engsub with a profile (already checked by the caller): starts a translation when allowed.
     *
     * @return null when a translation started, otherwise why not
     */
    public SkipReason startFromFetch(String videoId, String profile) {
        Video video = find(videoId);
        if (!gemini.configured()) {
            return SkipReason.GEMINI_NOT_CONFIGURED;
        }
        if (tooLong(video)) {
            return SkipReason.VIDEO_TOO_LONG;
        }
        if (video.getViSource() == ViSource.MANUAL) {
            return SkipReason.VIETSUB_MANUAL;
        }
        if (video.getTranslationStatus() == TranslationStatus.TRANSLATING) {
            return SkipReason.TRANSLATION_IN_PROGRESS;
        }
        if (video.getViSource() == ViSource.AUTO) {
            return SkipReason.VIETSUB_EXISTS;
        }
        if (begin(video, profile, false)) {
            return null;
        }
        return find(videoId).getViSource() == ViSource.MANUAL
                ? SkipReason.VIETSUB_MANUAL : SkipReason.TRANSLATION_IN_PROGRESS;
    }

    /** The "Translate again" button: may replace an AUTO Vietsub, never a MANUAL one. */
    public void retranslate(String videoId, String profile) {
        Video video = find(videoId);
        if (!gemini.configured()) {
            throw new GeminiNotConfiguredException(videoId);
        }
        profiles.read(profile);
        if (tooLong(video)) {
            throw new VideoTooLongException(videoId);
        }
        if (video.getViSource() == ViSource.MANUAL) {
            throw new VietsubManualException(videoId);
        }
        if (video.getTranslationStatus() == TranslationStatus.TRANSLATING) {
            throw new TranslationInProgressException(videoId);
        }
        if (!begin(video, profile, true)) {
            if (find(videoId).getViSource() == ViSource.MANUAL) {
                throw new VietsubManualException(videoId);
            }
            throw new TranslationInProgressException(videoId);
        }
    }

    /** The Gemini model a running translation of this video is asking right now; null when none. */
    public String activeModel(String videoId) {
        return activeModel.get(videoId);
    }

    /** The part ("2/3") a running translation of this video is on; null for one-part videos and when none runs. */
    public String activePart(String videoId) {
        return activePart.get(videoId);
    }

    /** At startup nothing can still be running: earlier runs died with the previous process. */
    @EventListener(ApplicationReadyEvent.class)
    public void markInterrupted() {
        tx.execute(status -> videos.failAllTranslating(INTERRUPTED));
    }

    private boolean begin(Video video, String profile, boolean fillDescription) {
        String id = video.getId();
        Integer updated = tx.execute(status -> videos.markTranslating(id, profile));
        if (updated == null || updated == 0) {
            return false;
        }
        executor.execute(() -> run(video, profile, fillDescription));
        return true;
    }

    private void run(Video video, String profile, boolean fillDescription) {
        String id = video.getId();
        try {
            runTranslation(video, profile, fillDescription);
        } finally {
            activeModel.remove(id);
            activePart.remove(id);
        }
    }

    private void runTranslation(Video video, String profile, boolean fillDescription) {
        String id = video.getId();
        String[] lastTried = {null};
        int[] progress = {0, 1}; // the part being translated (1-based, 0 = none yet) and how many parts there are
        try {
            String profileText = profiles.read(profile);
            List<CueEntity> english = cues.findByVideo_IdOrderByIdxAsc(id);
            List<Long> starts = english.stream().map(CueEntity::getStartMs).toList();
            List<TranslationParts.Range> ranges = TranslationParts.split(starts, gemini.partDuration().toMillis());
            VideoContext context = context(video, profile, fillDescription);
            List<TranslatedLine> translated;
            String model;
            if (ranges.size() <= 1) {
                List<SourceLine> lines = sourceLines(english, 0, english.size());
                translated = translator.translate(context, profileText, lines, tried(id, lastTried));
                model = lastTried[0];
            } else {
                progress[1] = ranges.size();
                PartsResult result = translateInParts(id, profile, profileText, english, ranges, context, progress,
                        lastTried);
                translated = result.lines();
                model = result.model();
            }
            List<ViCue> vietsubCues = new ArrayList<>(english.size());
            for (int i = 0; i < english.size(); i++) {
                CueEntity cue = english.get(i);
                vietsubCues.add(new ViCue(cue.getStartMs(), cue.getEndMs(), translated.get(i).text()));
            }
            vietsub.saveAuto(id, vietsubCues, profile, model);
            if (ranges.size() > 1) {
                partials.delete(id);
            }
        } catch (TranslationFailedException e) {
            log.warn("Translation of {} failed: {}", id, e.userMessage());
            fail(id, partMessage(progress, e.userMessage()));
        } catch (UnknownProfileException e) {
            fail(id, "Could not translate: translation profile \"" + profile + "\" can no longer be used.");
        } catch (RuntimeException e) {
            log.warn("Translation of {} failed: {}", id, e.getClass().getName());
            fail(id, progress[0] == 0 ? "Could not translate: " + e.getClass().getSimpleName() + "."
                    : partMessage(progress, e.getClass().getSimpleName()));
        }
    }

    private record PartsResult(List<TranslatedLine> lines, String model) {}

    /**
     * Translates the missing parts one after another, keeping each finished part in the partial file at once, so a
     * failure loses nothing already done. The caller deletes the file after the Vietsub is saved.
     */
    private PartsResult translateInParts(String id, String profile, String profileText, List<CueEntity> english,
                                         List<TranslationParts.Range> ranges, VideoContext context, int[] progress,
                                         String[] lastTried) {
        int total = ranges.size();
        List<PartialTranslationStore.Part> parts = new ArrayList<>(usableParts(id, profile, english, ranges));
        Map<Integer, String> englishByIdx = new LinkedHashMap<>();
        english.forEach(c -> englishByIdx.put(c.getIdx(), c.getTextEn()));
        for (int i = parts.size(); i < total; i++) {
            progress[0] = i + 1;
            activePart.put(id, (i + 1) + "/" + total);
            lastTried[0] = null;
            TranslationParts.Range range = ranges.get(i);
            List<SourceLine> lines = sourceLines(english, range.from(), range.to());
            List<ExamplePair> previous = i == 0 ? List.of() : lastLines(parts.get(i - 1), englishByIdx);
            VideoContext partContext = new VideoContext(context.title(), context.channel(), context.description(),
                    context.examples(), previous);
            List<TranslatedLine> got = translator.translate(partContext, profileText, lines, tried(id, lastTried));
            log.info("translate {}: part {}/{}, {} lines, model {}", id, i + 1, total, lines.size(), lastTried[0]);
            parts.add(new PartialTranslationStore.Part(i,
                    got.stream().map(l -> new PartialTranslationStore.PartLine(l.id(), l.text())).toList(),
                    lastTried[0]));
            partials.save(id, new PartialTranslationStore.Partial(profile, english.size(), parts));
        }
        List<TranslatedLine> all = new ArrayList<>(english.size());
        Set<String> models = new LinkedHashSet<>();
        for (PartialTranslationStore.Part part : parts) {
            part.lines().forEach(l -> all.add(new TranslatedLine(l.idx(), l.text())));
            if (part.model() != null) {
                models.add(part.model());
            }
        }
        return new PartsResult(all, models.isEmpty() ? null : String.join(", ", models));
    }

    /**
     * The finished parts from an earlier run, only when they belong to this profile, this English subtitle and the
     * same split; otherwise the file is deleted so parts of two different runs are never mixed.
     */
    private List<PartialTranslationStore.Part> usableParts(String id, String profile, List<CueEntity> english,
                                                           List<TranslationParts.Range> ranges) {
        PartialTranslationStore.Partial saved = partials.load(id).orElse(null);
        if (saved == null) {
            return List.of();
        }
        boolean usable = profile.equals(saved.profile()) && saved.cueCount() == english.size()
                && saved.parts().size() <= ranges.size();
        for (int i = 0; usable && i < saved.parts().size(); i++) {
            PartialTranslationStore.Part part = saved.parts().get(i);
            TranslationParts.Range range = ranges.get(i);
            usable = part.index() == i && part.lines() != null && part.lines().size() == range.size();
            for (int k = 0; usable && k < range.size(); k++) {
                usable = part.lines().get(k).idx() == english.get(range.from() + k).getIdx();
            }
        }
        if (!usable) {
            partials.delete(id);
            return List.of();
        }
        return saved.parts();
    }

    private static List<ExamplePair> lastLines(PartialTranslationStore.Part part, Map<Integer, String> englishByIdx) {
        List<PartialTranslationStore.PartLine> lines = part.lines();
        List<ExamplePair> pairs = new ArrayList<>();
        for (PartialTranslationStore.PartLine l : lines.subList(Math.max(0, lines.size() - CONTEXT_LINES), lines.size())) {
            pairs.add(new ExamplePair(englishByIdx.get(l.idx()), l.text()));
        }
        return pairs;
    }

    private static List<SourceLine> sourceLines(List<CueEntity> english, int from, int to) {
        return english.subList(from, to).stream().map(c -> new SourceLine(c.getIdx(), c.getTextEn())).toList();
    }

    private java.util.function.Consumer<String> tried(String id, String[] lastTried) {
        return model -> {
            lastTried[0] = model;
            activeModel.put(id, model);
        };
    }

    /** For a long video that failed on a part, says which part and that Translate again continues from it. */
    private static String partMessage(int[] progress, String reason) {
        if (progress[0] == 0) {
            return reason;
        }
        String shortReason = reason.endsWith(".") ? reason.substring(0, reason.length() - 1) : reason;
        return "Could not translate part " + progress[0] + "/" + progress[1] + ": " + shortReason
                + ". Translate again continues from part " + progress[0] + ".";
    }

    /**
     * Title, channel, cleaned description and approved examples. Context only helps, so any error here is logged
     * (never with subtitle or description text) and the translation goes on without that part.
     */
    private VideoContext context(Video video, String profile, boolean fillDescription) {
        String id = video.getId();
        String description = video.getDescription();
        if (description == null && fillDescription) {
            description = fetchDescription(id);
        }
        List<ExamplePair> examples = List.of();
        try {
            examples = exampleSource.examplesFor(profile, id);
        } catch (RuntimeException e) {
            log.warn("Could not build examples for {}: {}", id, e.getClass().getSimpleName());
        }
        return new VideoContext(video.getTitle(), video.getChannel(), DescriptionCleaner.clean(description), examples);
    }

    /** Older videos have no description yet: ask yt-dlp once and keep it. Failure just means no description. */
    private String fetchDescription(String id) {
        try {
            String description = ytDlp.fetchInfo(id).description();
            if (description != null) {
                tx.executeWithoutResult(status -> videos.findById(id).ifPresent(v -> v.setDescription(description)));
            }
            return description;
        } catch (RuntimeException e) {
            log.warn("Could not fetch the description of {}: {}", id, e.getClass().getSimpleName());
            return null;
        }
    }

    private void fail(String id, String message) {
        String text = message.length() > MAX_ERROR_LENGTH ? message.substring(0, MAX_ERROR_LENGTH) : message;
        tx.execute(status -> videos.markFailed(id, text)); // 0 rows when the video was deleted meanwhile
    }

    private boolean tooLong(Video video) {
        Integer seconds = video.getDurationSec();
        return seconds != null && seconds > gemini.maxDuration().toSeconds();
    }

    private Video find(String id) {
        return videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id));
    }
}
