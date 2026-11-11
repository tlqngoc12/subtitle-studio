package com.subtitlestudio.fanfic;

import java.time.Instant;
import java.util.List;

/**
 * A fanfic as the API and the public export return it. {@code id}, {@code createdAt} are null in a preview, whose
 * {@code coverUrl} is still Wattpad's own URL; saved fanfics point at the stored {@code /api/media/{id}} cover.
 */
public record FanficDto(Long id, String url, String title, String author, String description, List<String> tags,
                        String coverUrl, long readCount, long voteCount, long partCount, long wordCount,
                        long readingMinutes, boolean completed, Instant storyUpdatedAt, Instant fetchedAt,
                        Instant createdAt) {
}
