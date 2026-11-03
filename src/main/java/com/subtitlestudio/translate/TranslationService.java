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
import java.util.ArrayList;
import java.util.List;
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
 * UPDATE); from Lấy Engsub only when the video has no Vietsub yet; status and errors live in the database.
 */
@Service
public class TranslationService {

    static final String INTERRUPTED = "Bị gián đoạn do app khởi động lại, hãy dịch lại.";
    private static final int MAX_ERROR_LENGTH = 500;
    private static final Logger log = LoggerFactory.getLogger(TranslationService.class);

    private final SubtitleStudioProperties.Gemini gemini;
    private final PromptProfileStore profiles;
    private final GeminiTranslator translator;
    private final VideoRepository videos;
    private final CueRepository cues;
    private final VietsubService vietsub;
    private final TransactionTemplate tx;
    private final Executor executor;

    public TranslationService(SubtitleStudioProperties properties, PromptProfileStore profiles,
                              GeminiTranslator translator, VideoRepository videos, CueRepository cues,
                              VietsubService vietsub, TransactionTemplate tx,
                              @Qualifier("translationExecutor") Executor executor) {
        this.gemini = properties.gemini();
        this.profiles = profiles;
        this.translator = translator;
        this.videos = videos;
        this.cues = cues;
        this.vietsub = vietsub;
        this.tx = tx;
        this.executor = executor;
    }

    /**
     * After Lấy Engsub with a profile (already checked by the caller): starts a translation when allowed.
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
        if (begin(video, profile)) {
            return null;
        }
        return find(videoId).getViSource() == ViSource.MANUAL
                ? SkipReason.VIETSUB_MANUAL : SkipReason.TRANSLATION_IN_PROGRESS;
    }

    /** The "Dịch lại" button: may replace an AUTO Vietsub, never a MANUAL one. */
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
        if (!begin(video, profile)) {
            if (find(videoId).getViSource() == ViSource.MANUAL) {
                throw new VietsubManualException(videoId);
            }
            throw new TranslationInProgressException(videoId);
        }
    }

    /** At startup nothing can still be running: earlier runs died with the previous process. */
    @EventListener(ApplicationReadyEvent.class)
    public void markInterrupted() {
        tx.execute(status -> videos.failAllTranslating(INTERRUPTED));
    }

    private boolean begin(Video video, String profile) {
        String id = video.getId();
        VideoContext context = new VideoContext(video.getTitle(), video.getChannel());
        Integer updated = tx.execute(status -> videos.markTranslating(id, profile));
        if (updated == null || updated == 0) {
            return false;
        }
        executor.execute(() -> run(id, profile, context));
        return true;
    }

    private void run(String id, String profile, VideoContext context) {
        try {
            String profileText = profiles.read(profile);
            List<CueEntity> english = cues.findByVideo_IdOrderByIdxAsc(id);
            List<SourceLine> lines = english.stream().map(c -> new SourceLine(c.getIdx(), c.getTextEn())).toList();
            List<TranslatedLine> translated = translator.translate(context, profileText, lines);
            List<ViCue> vietsubCues = new ArrayList<>(english.size());
            for (int i = 0; i < english.size(); i++) {
                CueEntity cue = english.get(i);
                vietsubCues.add(new ViCue(cue.getStartMs(), cue.getEndMs(), translated.get(i).text()));
            }
            vietsub.saveAuto(id, vietsubCues, profile);
        } catch (TranslationFailedException e) {
            fail(id, e.userMessage());
        } catch (UnknownProfileException e) {
            fail(id, "Không dịch được: hồ sơ dịch \"" + profile + "\" không còn dùng được.");
        } catch (RuntimeException e) {
            log.warn("Translation of {} failed: {}", id, e.getClass().getName());
            fail(id, "Không dịch được: lỗi " + e.getClass().getSimpleName() + ".");
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
