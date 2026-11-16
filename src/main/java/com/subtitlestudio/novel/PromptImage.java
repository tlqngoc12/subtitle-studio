package com.subtitlestudio.novel;

/** An image of a chapter as Gemini gets it: already resized, with the media id its marker paragraph names. */
public record PromptImage(long mediaId, String mimeType, byte[] bytes) {
}
