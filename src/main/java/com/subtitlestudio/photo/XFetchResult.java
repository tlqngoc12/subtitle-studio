package com.subtitlestudio.photo;

import java.time.LocalDate;

/** The image of an X post, already stored as an uploaded image, plus the post's date and caption (either may be null). */
public record XFetchResult(long mediaId, String mediaUrl, Integer width, Integer height, LocalDate takenOn,
                           String title) {
}
