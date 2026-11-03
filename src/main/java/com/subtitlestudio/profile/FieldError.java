package com.subtitlestudio.profile;

/** One rejected field of a block request, e.g. {@code items[2].value}. */
public record FieldError(String field, String message) {
}
