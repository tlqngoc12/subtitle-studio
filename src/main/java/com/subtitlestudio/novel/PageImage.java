package com.subtitlestudio.novel;

/** A page screenshot ready for Gemini: its page number in the chapter and a JPEG. */
public record PageImage(int page, byte[] jpeg) {
}
