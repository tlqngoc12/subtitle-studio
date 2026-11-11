package com.subtitlestudio.work;

import java.time.LocalDate;
import java.util.List;

/**
 * A whole work. The public export nulls {@code coverMediaId} and the people's {@code avatarMediaId} and swaps the image URLs.
 */
public record WorkDto(long id, String title, String coverUrl, LocalDate releaseDate, List<WorkCategory> categories,
                      String subcategory, String profile, Long coverMediaId, String description,
                      List<WorkLinkDto> links, List<WorkCreditDto> credits) {
}
