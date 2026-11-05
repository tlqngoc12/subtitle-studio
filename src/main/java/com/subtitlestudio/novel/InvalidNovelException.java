package com.subtitlestudio.novel;

import com.subtitlestudio.profile.FieldError;
import java.util.List;

/** A novel request failed validation; carries every rejected field. */
public class InvalidNovelException extends RuntimeException {

    private final List<FieldError> errors;

    public InvalidNovelException(List<FieldError> errors) {
        super("Invalid novel: " + errors.stream().map(FieldError::field).toList());
        this.errors = List.copyOf(errors);
    }

    public List<FieldError> errors() {
        return errors;
    }
}
