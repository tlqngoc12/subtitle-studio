package com.subtitlestudio.playlist;

import java.util.List;

/** The full new order of a playlist, first video first. */
public record OrderRequest(List<String> videoIds) {
}
