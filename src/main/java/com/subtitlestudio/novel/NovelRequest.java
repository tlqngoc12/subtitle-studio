package com.subtitlestudio.novel;

import java.util.List;

/** Create or edit a novel (spec section 3). {@code promptProfile} may be null: then Translate is off. */
public record NovelRequest(String slug, String title, Long coverMediaId, String originalAuthor, String description,
                           List<String> tags, NovelStatus novelStatus, String translatorCredit, String sourceUrl,
                           String promptProfile) {
}
