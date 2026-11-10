package com.subtitlestudio.novel.render;

import java.nio.file.Path;
import java.util.List;

/** The cached page images of one chapter in one {@link PageFormat}, in reading order. */
public record RenderedFormat(PageFormat format, List<Path> files) {
}
