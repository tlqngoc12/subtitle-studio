package com.subtitlestudio.video;

import com.subtitlestudio.profile.FieldError;
import java.util.List;

/** An edited-text save failed validation; carries every rejected field, e.g. {@code lines[3].text}. */
public class InvalidVietsubTextException extends RuntimeException {

    private final List<FieldError> errors;

    public InvalidVietsubTextException(List<FieldError> errors) {
        super("Invalid Vietsub text: " + errors.stream().map(FieldError::field).toList());
        this.errors = List.copyOf(errors);
    }

    public List<FieldError> errors() {
        return errors;
    }
}
