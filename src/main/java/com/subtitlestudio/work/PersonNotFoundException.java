package com.subtitlestudio.work;

public class PersonNotFoundException extends RuntimeException {

    public PersonNotFoundException(long id) {
        super("Person not found: " + id);
    }
}
