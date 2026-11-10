package com.subtitlestudio.publish;

import java.util.List;

/** One page format of a published chapter: its key, page size in pixels and the image URLs in reading order. */
public record PublicPageFormat(String key, int width, int height, List<String> images) {
}
