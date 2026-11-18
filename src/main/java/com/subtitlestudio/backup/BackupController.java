package com.subtitlestudio.backup;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Admin API for backups: the list with the last result, and "Backup now". */
@RestController
public class BackupController {

    private final BackupService service;

    public BackupController(BackupService service) {
        this.service = service;
    }

    @GetMapping("/api/backups")
    public BackupService.Status status() {
        return service.status();
    }

    /** Starts a run in the background; 409 {@code BACKUP_RUNNING} when one is going. */
    @PostMapping("/api/backups")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void start() {
        if (!service.start()) {
            throw new BackupRunningException();
        }
    }
}
