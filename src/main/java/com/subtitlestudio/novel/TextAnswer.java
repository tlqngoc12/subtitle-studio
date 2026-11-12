package com.subtitlestudio.novel;

/** A complete Vietnamese translation of the text sent, and the Gemini model that gave it. */
public record TextAnswer(String text, String model) {
}
