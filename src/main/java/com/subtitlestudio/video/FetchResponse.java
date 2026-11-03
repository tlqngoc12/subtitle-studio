package com.subtitlestudio.video;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonUnwrapped;
import com.subtitlestudio.translate.SkipReason;

/** {@link VideoDto} plus, when a profile was given but no translation started, the reason why. */
public record FetchResponse(
        @JsonUnwrapped VideoDto video,
        @JsonInclude(JsonInclude.Include.NON_NULL) SkipReason skipReason) {}
