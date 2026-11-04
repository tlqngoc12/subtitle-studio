package com.subtitlestudio.playlist;

/** Create / update body; on update a missing (null) field is left unchanged. */
public record PlaylistRequest(String name, String description) {
}
