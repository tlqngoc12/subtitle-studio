package com.subtitlestudio.novel.render;

import java.util.List;

/**
 * A page size the public reader can pick: image size plus the side margin the text keeps. Tall pages keep a chapter
 * at about 57 files across all formats (Cloudflare Pages Free allows 20,000 files per site).
 */
public record PageFormat(String key, int width, int height, int margin) {

    public static final PageFormat S = new PageFormat("s", 1080, 4800, 64);
    public static final PageFormat M = new PageFormat("m", 820, 3645, 32);
    public static final PageFormat L = new PageFormat("l", 700, 3111, 28);
    public static final List<PageFormat> ALL = List.of(S, M, L);
}
