package com.subtitlestudio.novel.wattpad;

import java.time.Instant;

/** One Wattpad part as shown on the novel page; {@code importedChapterId} is null until it is imported. */
public record WattpadPartRow(String partId, String title, int wordCount, Instant createdAt, Instant modifiedAt,
                             boolean deleted, Long importedChapterId) {
}
