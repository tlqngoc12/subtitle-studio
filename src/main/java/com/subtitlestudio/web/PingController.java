package com.subtitlestudio.web;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Light liveness probe for the Docker healthcheck: no database access, no body. */
@RestController
public class PingController {

    @GetMapping("/api/ping")
    public ResponseEntity<Void> ping() {
        return ResponseEntity.noContent().build();
    }
}
