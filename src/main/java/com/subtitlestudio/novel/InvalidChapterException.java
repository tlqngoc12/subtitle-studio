package com.subtitlestudio.novel;

import com.subtitlestudio.profile.FieldError;
import java.util.List;

/** A chapter request failed validation; carries every rejected field. */
public class InvalidChapterException extends RuntimeException {

    private final List<FieldError> errors;

    public InvalidChapterException(List<FieldError> errors) {
        super("Invalid chapter: " + errors.stream().map(FieldError::field).toList());
        this.errors = List.copyOf(errors);
    }

    public List<FieldError> errors() {
        return errors;
    }
}
