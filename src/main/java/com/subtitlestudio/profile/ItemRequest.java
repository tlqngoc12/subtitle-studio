package com.subtitlestudio.profile;

/** One GALLERY / LINKS / FACTS entry in a block request. */
public record ItemRequest(String label, String value, Long mediaId) {
}
