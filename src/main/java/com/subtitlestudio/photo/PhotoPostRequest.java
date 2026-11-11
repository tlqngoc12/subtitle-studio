package com.subtitlestudio.photo;

import java.time.LocalDate;
import java.util.List;

/** Body of POST/PUT /api/photos; {@code profiles} are profile slugs. */
public record PhotoPostRequest(String postUrl, Long mediaId, String title, LocalDate takenOn,
                               PhotoSource source, Integer photoCount, List<String> profiles) {
}
