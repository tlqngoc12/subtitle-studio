package com.subtitlestudio.work;

import java.time.LocalDate;

/** A row of the Works grid; {@code releaseDate} null means "Coming Soon", {@code profile} is a slug or null. */
public record WorkSummaryDto(long id, String title, String coverUrl, LocalDate releaseDate, WorkCategory category,
                             String subcategory, String profile) {
}
