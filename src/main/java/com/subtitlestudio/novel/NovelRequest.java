package com.subtitlestudio.novel;

import java.util.List;

/**
 * Create or edit a novel (spec section 3). {@code promptProfile} may be null: then Translate is off.
 * {@code trailerUrl} is an optional YouTube link; {@link NovelValidator} turns it into the 11-character video id.
 */
public record NovelRequest(String slug, String title, Long coverMediaId, String originalAuthor, String description,
                           List<String> tags, NovelStatus novelStatus, String translatorCredit, String sourceUrl,
                           String promptProfile, String trailerUrl) {
}
