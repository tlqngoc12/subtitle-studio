package com.subtitlestudio.novel.wattpad;

import java.time.Instant;

/** One Wattpad part in the New novel preview; read-only, nothing is saved. */
public record WattpadPreviewPart(String partId, String title, int wordCount, Instant modifiedAt, boolean deleted) {
}
