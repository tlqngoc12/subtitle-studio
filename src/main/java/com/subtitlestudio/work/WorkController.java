package com.subtitlestudio.work;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** REST API of the Works menu and the people directory. */
@RestController
public class WorkController {

    private final WorkService works;
    private final PersonService people;

    public WorkController(WorkService works, PersonService people) {
        this.works = works;
        this.people = people;
    }

    @GetMapping("/api/works")
    public List<WorkSummaryDto> list() {
        return works.list();
    }

    @GetMapping("/api/works/{id}")
    public WorkDto get(@PathVariable long id) {
        return works.get(id);
    }

    @PostMapping("/api/works")
    public ResponseEntity<WorkDto> create(@RequestBody WorkRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(works.create(request));
    }

    @PutMapping("/api/works/{id}")
    public WorkDto update(@PathVariable long id, @RequestBody WorkRequest request) {
        return works.update(id, request);
    }

    @DeleteMapping("/api/works/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        works.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/people")
    public List<PersonDto> listPeople() {
        return people.list();
    }

    @PostMapping("/api/people")
    public ResponseEntity<PersonDto> createPerson(@RequestBody PersonRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(people.create(request));
    }

    @PutMapping("/api/people/{id}")
    public PersonDto updatePerson(@PathVariable long id, @RequestBody PersonRequest request) {
        return people.update(id, request);
    }

    @DeleteMapping("/api/people/{id}")
    public ResponseEntity<Void> deletePerson(@PathVariable long id) {
        people.delete(id);
        return ResponseEntity.noContent().build();
    }
}
