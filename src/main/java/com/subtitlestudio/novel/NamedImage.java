package com.subtitlestudio.novel;

/** An uploaded screenshot: the user's file name (for ordering) and its bytes. */
public record NamedImage(String name, byte[] bytes) {
}
