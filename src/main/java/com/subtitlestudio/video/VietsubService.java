package com.subtitlestudio.video;

import org.springframework.context.ApplicationEventPublisher;
import com.subtitlestudio.subtitle.Cue;
import com.subtitlestudio.subtitle.InvalidSrtException;
import com.subtitlestudio.subtitle.SrtEntry;
import com.subtitlestudio.subtitle.SrtParser;
import com.subtitlestudio.subtitle.SrtWriter;
import com.subtitlestudio.url.UrlParser;
import java.text.Normalizer;
import com.subtitlestudio.profile.FieldError;
import com.subtitlestudio.translate.TranslationInProgressException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
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

    private final ApplicationEventPublisher events;

    static final int MAX_TEXT_LENGTH = 1000;
    /** Checked here: the multipart limit is 10 MB for profile images. */
    static final int MAX_SRT_BYTES = 5 * 1024 * 1024;

    private final UrlParser urlParser;
    private final SrtParser srtParser;
    private final SrtWriter srtWriter;
    private final SubtitleService subtitleService;
    private final VideoRepository videos;
    private final ViCueRepository viCues;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final SubtitleFileStore files;

    public VietsubService(UrlParser urlParser, SrtParser srtParser, SrtWriter srtWriter, SubtitleService subtitleService,
                          VideoRepository videos, ViCueRepository viCues, TransactionTemplate tx, Clock clock,
                          SubtitleFileStore files,
                          ApplicationEventPublisher events) {
        this.events = events;
        this.files = files;
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
        if (srt.length > MAX_SRT_BYTES) {
            throw new FileTooLargeException();
        }
        String id = urlParser.parse(url);
        List<ViCue> cues = toCues(srtParser.parse(srt).entries());

        if (!videos.existsById(id)) {
            subtitleService.fetch(url);
        }
        Video saved = tx.execute(status -> {
            viCues.deleteByVideoId(id); // clears the persistence context, so load the video afterwards
            Video video = videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id));
            List<ViCueEntity> entities = new ArrayList<>(cues.size());
            for (int i = 0; i < cues.size(); i++) {
                ViCue c = cues.get(i);
                entities.add(new ViCueEntity(video, i, c.startMs(), c.endMs(), c.text()));
            }
            viCues.saveAll(entities);
            video.updateVietsub(cues.size(), clock.instant(), ViSource.MANUAL);
            video.setEditStatus(EditStatus.DONE); // an uploaded file is a finished Vietsub
            return video;
        });
        files.writeViManual(id, srt); // the upload exactly as received
        return saved;
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

    /**
     * Stores a Gemini translation as the AUTO Vietsub. Under a row lock, re-checks that the video still
     * exists and that the user has not uploaded their own Vietsub meanwhile (MANUAL always wins).
     *
     * @return whether the translation was stored
     */
    public boolean saveAuto(String id, List<ViCue> cues, String profile) {
        return saveAuto(id, cues, profile, null);
    }

    /** {@code model}: the Gemini model that translated, stored for display; null = unknown. */
    public boolean saveAuto(String id, List<ViCue> cues, String profile, String model) {
        Boolean saved = tx.execute(status -> {
            var locked = videos.findForUpdate(id);
            if (locked.isEmpty()) {
                return false;
            }
            if (locked.get().getViSource() == ViSource.MANUAL) {
                locked.get().translationDiscarded();
                return false;
            }
            viCues.deleteByVideoId(id); // clears the persistence context; the row lock is kept
            Video video = videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id));
            List<ViCueEntity> entities = new ArrayList<>(cues.size());
            for (int i = 0; i < cues.size(); i++) {
                ViCue c = cues.get(i);
                entities.add(new ViCueEntity(video, i, c.startMs(), c.endMs(), c.text()));
            }
            viCues.saveAll(entities);
            video.updateVietsub(cues.size(), clock.instant(), ViSource.AUTO);
            video.translationSucceeded(profile, model);
            return true;
        });
        if (Boolean.TRUE.equals(saved)) {
            List<Cue> asCues = cues.stream().map(c -> new Cue(c.startMs(), c.endMs(), c.text())).toList();
            files.writeViAuto(id, srtWriter.toBytes(asCues, false));
        }
        return Boolean.TRUE.equals(saved);
    }

    /**
     * Saves text edited in the live editor. Timing is untouched; the Vietsub becomes MANUAL (so a later Gemini
     * run never replaces it) and {@code vi_manual.srt} is rewritten from the cues. Under a row lock, refuses with
     * {@link VietsubChangedException} when the Vietsub changed since {@code request.baseUpdatedAt()}, and with
     * {@link TranslationInProgressException} while Gemini is translating this video.
     */
    public Video saveText(String id, VietsubTextRequest request) {
        List<Cue> written = new ArrayList<>();
        Video saved = tx.execute(status -> {
            Video video = videos.findForUpdate(id).orElseThrow(() -> new VideoNotFoundException(id));
            if (video.getViCueCount() == 0) {
                throw new NoVietsubException(id);
            }
            if (video.getTranslationStatus() == TranslationStatus.TRANSLATING) {
                throw new TranslationInProgressException(id);
            }
            Instant base = request.baseUpdatedAt();
            Instant current = video.getViUpdatedAt();
            if (base == null || current == null
                    || !base.truncatedTo(ChronoUnit.MICROS).equals(current.truncatedTo(ChronoUnit.MICROS))) {
                throw new VietsubChangedException(id);
            }
            List<ViCueEntity> cues = viCues.findByVideo_IdOrderByIdxAsc(id);
            List<String> texts = validatedTexts(request.lines(), cues.size());
            for (int i = 0; i < cues.size(); i++) {
                cues.get(i).setText(texts.get(i));
                ViCue c = cues.get(i).toViCue();
                written.add(new Cue(c.startMs(), c.endMs(), c.text()));
            }
            video.updateVietsub(cues.size(), clock.instant(), ViSource.MANUAL);
            if (video.getEditStatus() == null) {
                video.setEditStatus(EditStatus.IN_PROGRESS); // DONE and IN_PROGRESS stay as they are
            }
            return video;
        });
        files.writeViManual(id, srtWriter.toBytes(written, false));
        return saved;
    }

    /**
     * Marks the Vietsub as done or back in progress. Does not touch the text or {@code viUpdatedAt}. Refused with
     * {@link NoVietsubException} when there is no Vietsub, {@link TranslationInProgressException} while Gemini is
     * translating, and {@link VietsubNotManualException} for an AI (AUTO) Vietsub.
     */
    public Video setEditStatus(String id, EditStatus status) {
        if (status == null) {
            throw new InvalidVietsubTextException(List.of(new FieldError("status", "Status is required")));
        }
        return tx.execute(s -> {
            Video video = videos.findForUpdate(id).orElseThrow(() -> new VideoNotFoundException(id));
            if (video.getViCueCount() == 0) {
                throw new NoVietsubException(id);
            }
            if (video.getTranslationStatus() == TranslationStatus.TRANSLATING) {
                throw new TranslationInProgressException(id);
            }
            if (video.getViSource() != ViSource.MANUAL) {
                throw new VietsubNotManualException(id);
            }
            video.setEditStatus(status);
            return video;
        });
    }

    /** Checks count and order, then trims each text (NFC, LF) and checks 1..1000 characters. */
    private static List<String> validatedTexts(List<VietsubTextRequest.LineText> lines, int expected) {
        if (lines == null || lines.size() != expected) {
            throw new InvalidVietsubTextException(List.of(new FieldError("lines",
                    "Expected " + expected + " lines but got " + (lines == null ? 0 : lines.size()))));
        }
        List<FieldError> errors = new ArrayList<>();
        List<String> texts = new ArrayList<>(expected);
        for (int i = 0; i < expected; i++) {
            VietsubTextRequest.LineText line = lines.get(i);
            if (line == null || line.idx() != i) {
                throw new InvalidVietsubTextException(List.of(new FieldError("lines[" + i + "].idx",
                        "Lines must be in order, starting at 0")));
            }
            String text = line.text() == null ? ""
                    : Normalizer.normalize(line.text().replace("\r\n", "\n").replace('\r', '\n'), Normalizer.Form.NFC).strip();
            if (text.isEmpty()) {
                errors.add(new FieldError("lines[" + i + "].text", "Text is required"));
            } else if (text.length() > MAX_TEXT_LENGTH) {
                errors.add(new FieldError("lines[" + i + "].text", "Text is longer than " + MAX_TEXT_LENGTH + " characters"));
            }
            texts.add(text);
        }
        if (!errors.isEmpty()) {
            throw new InvalidVietsubTextException(errors);
        }
        return texts;
    }

    /** Removes the Vietsub and the file of its source; the other source's file is kept. */
    public void clear(String id) {
        ViSource source = tx.execute(status -> {
            ViSource current = videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id)).getViSource();
            events.publishEvent(new VideoRemovalEvent(id)); // playlists hold only videos with Vietsub
            viCues.deleteByVideoId(id); // clears the persistence context, so load the video afterwards
            videos.findById(id).orElseThrow(() -> new VideoNotFoundException(id)).clearVietsub();
            return current;
        });
        if (source != null) {
            files.deleteVi(id, source);
        }
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
