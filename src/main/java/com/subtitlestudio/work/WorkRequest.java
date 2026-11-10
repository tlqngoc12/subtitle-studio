package com.subtitlestudio.work;

import java.time.LocalDate;
import java.util.List;

/** Body of POST/PUT /api/works. {@code profile} is a profile slug; links and credits replace the stored lists. */
public record WorkRequest(String title, Long coverMediaId, LocalDate releaseDate, WorkCategory category,
                          String subcategory, String profile, String description, List<WorkLinkRequest> links,
                          List<WorkCreditRequest> credits) {
}
