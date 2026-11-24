package com.subtitlestudio.publish;

import java.nio.file.Path;

/**
 * A chapter image of the public site. {@code key} is the URL without the leading slash
 * ({@code novel-images/<slug>/<file>}), which is also its object key in R2; {@code file} is the rendered image on disk.
 */
public record ChapterImage(String key, Path file) {}
