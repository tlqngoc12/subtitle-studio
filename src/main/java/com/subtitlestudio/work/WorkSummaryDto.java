package com.subtitlestudio.work;

import java.time.LocalDate;
import java.util.List;

/** A row of the Works grid; {@code releaseDate} null means "Coming Soon", {@code profile} is a slug or null. */
public record WorkSummaryDto(long id, String title, String coverUrl, LocalDate releaseDate, List<WorkCategory> categories,
                             String subcategory, String profile) {
}
