package com.subtitlestudio.writing;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Admin API for the global writing rules file. */
@RestController
public class WritingRulesController {

    public static final int MAX_LENGTH = 20_000;

    /** {@code text} is null when the file does not exist yet (the frontend then shows its seed). */
    public record RulesDto(String text) {
    }

    public record RulesRequest(String text) {
    }

    private final WritingRulesStore store;

    public WritingRulesController(WritingRulesStore store) {
        this.store = store;
    }

    @GetMapping("/api/settings/writing-rules")
    public RulesDto get() {
        return new RulesDto(store.read().orElse(null));
    }

    @PutMapping("/api/settings/writing-rules")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void put(@RequestBody RulesRequest request) {
        if (request.text() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The text is missing");
        }
        if (request.text().length() > MAX_LENGTH) {
            throw new WritingRulesTooLongException(MAX_LENGTH);
        }
        store.write(request.text());
    }
}
