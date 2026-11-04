package com.subtitlestudio.publish;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** Starts a publish of the public site and reports its state (public site spec section 6). */
@RestController
public class PublishController {

    private final PublishService service;

    public PublishController(PublishService service) {
        this.service = service;
    }

    @PostMapping("/api/publish")
    public ResponseEntity<PublishStatus> start() {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(service.start());
    }

    @GetMapping("/api/publish")
    public PublishStatus status() {
        return service.status();
    }
}
