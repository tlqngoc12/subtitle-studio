package com.subtitlestudio.playlist;

import com.subtitlestudio.profile.FieldError;
import java.util.List;

/** A playlist name or description failed validation; carries every rejected field. */
public class InvalidPlaylistException extends RuntimeException {

    private final List<FieldError> errors;

    public InvalidPlaylistException(List<FieldError> errors) {
        super("Invalid playlist: " + errors.stream().map(FieldError::field).toList());
        this.errors = List.copyOf(errors);
    }

    public List<FieldError> errors() {
        return errors;
    }
}
