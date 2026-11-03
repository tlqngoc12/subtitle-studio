package com.subtitlestudio.translate;

/** Why Get Engsub with a profile did not start a translation. */
public enum SkipReason {
    GEMINI_NOT_CONFIGURED,
    VIDEO_TOO_LONG,
    VIETSUB_MANUAL,
    VIETSUB_EXISTS,
    TRANSLATION_IN_PROGRESS
}
