package com.subtitlestudio.novel;

/**
 * One page of a chapter: the screenshot URL, its translation (null until translated or typed), the Thai text Gemini
 * read from the image (null when unknown), whether the photo is landscape, and whether the translation looks much
 * shorter than the source.
 */
public record PageDto(long id, int position, String mediaUrl, String textVi, String source, boolean landscape,
                      boolean suspect) {
}
