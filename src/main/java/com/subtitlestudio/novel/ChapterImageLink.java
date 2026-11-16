package com.subtitlestudio.novel;

/** One image of a fetched chapter: the stored media and the Wattpad URL it came from. */
public record ChapterImageLink(long mediaId, String sourceUrl) {
}
