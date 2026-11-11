package com.subtitlestudio.photo;

import java.time.LocalDate;
import java.util.List;

/** A post as the API and the public export return it; {@code profiles} are slugs in page order (group first). */
public record PhotoPostDto(long id, String instagramUrl, String imageUrl, int width, int height, String title,
                           LocalDate takenOn, PhotoSource source, Integer photoCount,
                           List<String> profiles) {
}
