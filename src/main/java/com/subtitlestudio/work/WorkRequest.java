package com.subtitlestudio.work;

import java.time.LocalDate;
import java.util.List;

/** Body of POST/PUT /api/works. {@code categories} are 1-8 distinct values in order; {@code profile} is a profile slug; links and credits replace the stored lists. */
public record WorkRequest(String title, Long coverMediaId, LocalDate releaseDate, List<WorkCategory> categories,
                          String subcategory, String profile, String description, List<WorkLinkRequest> links,
                          List<WorkCreditRequest> credits) {
}
