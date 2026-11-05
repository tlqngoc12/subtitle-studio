package com.subtitlestudio.novel;

/** One page of a chapter: the screenshot URL and its translation (null until translated or typed). */
public record PageDto(long id, int position, String mediaUrl, String textVi) {
}
