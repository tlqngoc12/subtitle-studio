package com.subtitlestudio.translate;

/**
 * One item of Gemini's answer: {@code src} is the start of the English line it says it translated (used for the
 * check only, never stored); null or blank when the answer did not carry it.
 */
record AnswerLine(int id, String src, String text) {}
