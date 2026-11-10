package com.subtitlestudio.work;

import com.subtitlestudio.profile.FieldError;
import java.util.List;

/** A work or person request failed validation; carries every rejected field. */
public class InvalidWorkException extends RuntimeException {

    private final List<FieldError> errors;

    public InvalidWorkException(List<FieldError> errors) {
        super("Invalid work: " + errors.stream().map(FieldError::field).toList());
        this.errors = List.copyOf(errors);
    }

    public List<FieldError> errors() {
        return errors;
    }
}
