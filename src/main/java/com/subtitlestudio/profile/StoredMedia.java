package com.subtitlestudio.profile;

import java.nio.file.Path;

/** A stored image file and the content type to serve it with. */
public record StoredMedia(Path path, String contentType) {
}
