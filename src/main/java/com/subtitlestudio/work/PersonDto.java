package com.subtitlestudio.work;

/** A person of the directory; the public export nulls {@code avatarMediaId} and swaps {@code avatarUrl}. */
public record PersonDto(long id, String name, Long avatarMediaId, String avatarUrl) {
}
