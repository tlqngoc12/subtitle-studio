package com.subtitlestudio.profile;

import java.util.List;

/** A block request failed validation; carries every rejected field. */
public class InvalidBlockException extends RuntimeException {

    private final List<FieldError> errors;

    public InvalidBlockException(List<FieldError> errors) {
        super("Invalid block: " + errors.stream().map(FieldError::field).toList());
        this.errors = List.copyOf(errors);
    }

    public List<FieldError> errors() {
        return errors;
    }
}
