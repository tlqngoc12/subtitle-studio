package com.subtitlestudio.novel;

import java.util.List;

/**
 * Create or edit a novel (spec section 3). {@code promptProfile} may be null: then Translate is off.
 * {@code trailerUrl} is an optional YouTube link; {@link NovelValidator} turns it into the 11-character video id.
 * {@code sourceType} (default SCREENSHOTS), {@code sourceLanguage} (th|en, default th) and {@code wattpadStoryId} (required
 * for WATTPAD) say where the chapters come from; {@code coverUrl} is only used when creating a WATTPAD novel, to fetch
 * the story's cover. {@code wattpadUrl} is only used for an ORIGINAL story: an optional Wattpad story link whose id
 * the validator moves into {@code wattpadStoryId} (so chapters can be synced from Wattpad). After creation only {@code sourceLanguage} can change.
 */
public record NovelRequest(String slug, String title, Long coverMediaId, String originalAuthor, String description,
                           List<String> tags, NovelStatus novelStatus, String translatorCredit, String sourceUrl,
                           String promptProfile, String trailerUrl, NovelSourceType sourceType, String sourceLanguage,
                           String wattpadStoryId, String coverUrl, String wattpadUrl) {

    /** The fifteen-field form, without a Wattpad story link. */
    public NovelRequest(String slug, String title, Long coverMediaId, String originalAuthor, String description,
                        List<String> tags, NovelStatus novelStatus, String translatorCredit, String sourceUrl,
                        String promptProfile, String trailerUrl, NovelSourceType sourceType, String sourceLanguage,
                        String wattpadStoryId, String coverUrl) {
        this(slug, title, coverMediaId, originalAuthor, description, tags, novelStatus, translatorCredit, sourceUrl,
                promptProfile, trailerUrl, sourceType, sourceLanguage, wattpadStoryId, coverUrl, null);
    }

    /** A screenshot novel with Thai originals (the original eleven fields). */
    public NovelRequest(String slug, String title, Long coverMediaId, String originalAuthor, String description,
                        List<String> tags, NovelStatus novelStatus, String translatorCredit, String sourceUrl,
                        String promptProfile, String trailerUrl) {
        this(slug, title, coverMediaId, originalAuthor, description, tags, novelStatus, translatorCredit, sourceUrl,
                promptProfile, trailerUrl, null, null, null, null, null);
    }
}
