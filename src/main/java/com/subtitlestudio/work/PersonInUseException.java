package com.subtitlestudio.work;

import java.util.List;

/** The person is credited in works, so it cannot be deleted; {@code works} are their titles. */
public class PersonInUseException extends RuntimeException {

    private final List<String> works;

    public PersonInUseException(List<String> works) {
        super("Used by: " + String.join(", ", works));
        this.works = List.copyOf(works);
    }

    public List<String> works() {
        return works;
    }
}
