package com.subtitlestudio.video;

import com.subtitlestudio.subtitle.SourceType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** A YouTube video whose English subtitles have been fetched. Primary key is the 11-char video id. */
@Entity
@Table(name = "video")
public class Video {

    @Id
    @Column(length = 11)
    private String id;

    @Column(length = 500, nullable = false)
    private String title;

    @Column(length = 255)
    private String channel;

    @Column(name = "duration_sec")
    private Integer durationSec;

    @Column(name = "sub_lang", length = 16, nullable = false)
    private String subLang;

    @Enumerated(EnumType.STRING)
    @Column(name = "sub_source", length = 10, nullable = false)
    private SourceType subSource;

    @Column(name = "cue_count", nullable = false)
    private int cueCount;

    @Column(name = "fetched_at", nullable = false)
    private Instant fetchedAt;

    @Column(name = "vi_cue_count", nullable = false)
    private int viCueCount;

    @Column(name = "vi_updated_at")
    private Instant viUpdatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "vi_source", length = 10)
    private ViSource viSource;

    @Enumerated(EnumType.STRING)
    @Column(name = "translation_status", length = 12)
    private TranslationStatus translationStatus;

    @Column(name = "translation_error", length = 500)
    private String translationError;

    @Column(name = "translation_profile", length = 40)
    private String translationProfile;

    /** Gemini model(s) that translated this Vietsub, in order of use joined by ", "; null = unknown / not AUTO. */
    @Column(name = "translation_model", length = 200)
    private String translationModel;

    protected Video() {
        // for JPA
    }

    public Video(String id) {
        this.id = id;
    }

    public void update(String title, String channel, Integer durationSec, String subLang,
                       SourceType subSource, int cueCount, Instant fetchedAt) {
        this.title = title;
        this.channel = channel;
        this.durationSec = durationSec;
        this.subLang = subLang;
        this.subSource = subSource;
        this.cueCount = cueCount;
        this.fetchedAt = fetchedAt;
    }

    public String getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getChannel() {
        return channel;
    }

    public Integer getDurationSec() {
        return durationSec;
    }

    public String getSubLang() {
        return subLang;
    }

    public SourceType getSubSource() {
        return subSource;
    }

    public int getCueCount() {
        return cueCount;
    }

    public Instant getFetchedAt() {
        return fetchedAt;
    }

    public int getViCueCount() {
        return viCueCount;
    }

    public Instant getViUpdatedAt() {
        return viUpdatedAt;
    }

    public ViSource getViSource() {
        return viSource;
    }

    public TranslationStatus getTranslationStatus() {
        return translationStatus;
    }

    public String getTranslationError() {
        return translationError;
    }

    public String getTranslationModel() {
        return translationModel;
    }

    public void setTranslationModel(String translationModel) {
        this.translationModel = translationModel;
    }

    public String getTranslationProfile() {
        return translationProfile;
    }

    /** Records the Vietsub that is now stored and where it came from. */
    public void updateVietsub(int count, Instant at, ViSource source) {
        this.viCueCount = count;
        this.viUpdatedAt = at;
        this.viSource = source;
    }

    /** A Gemini translation was stored: no translation is pending any more. */
    public void translationSucceeded(String profile) {
        this.translationStatus = null;
        this.translationError = null;
        this.translationProfile = profile;
    }

    /** A finished translation was thrown away (the user's own Vietsub arrived meanwhile). */
    public void translationDiscarded() {
        this.translationStatus = null;
    }

    /** The Vietsub was removed; translation state is kept. */
    public void clearVietsub() {
        this.viCueCount = 0;
        this.viUpdatedAt = null;
        this.viSource = null;
    }
}
