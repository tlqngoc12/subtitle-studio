package com.subtitlestudio.backup;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Component;

/**
 * When the app was off at the daily backup time, the day is not backed up. A little after start-up this runs one
 * make-up backup if the daily backup is on and the newest backup is older than 24 hours (or there is none). The delay
 * gives Oracle time to be ready; the check is repeated when it ends, so a backup made meanwhile is not doubled.
 */
@Component
public class BackupCatchUp {

    static final Duration DELAY = Duration.ofMinutes(2);
    static final Duration MAX_AGE = Duration.ofHours(24);

    private static final Logger log = LoggerFactory.getLogger(BackupCatchUp.class);

    private final BackupService service;
    private final String cron;
    private final Clock clock;
    private final TaskScheduler scheduler;

    public BackupCatchUp(BackupService service, SubtitleStudioProperties properties, Clock clock,
                         TaskScheduler scheduler) {
        this.service = service;
        this.cron = properties.backup().cron();
        this.clock = clock;
        this.scheduler = scheduler;
    }

    @EventListener(ApplicationReadyEvent.class)
    void onReady() {
        if (cron.isBlank() || !CronExpression.isValidExpression(cron) || !overdue()) {
            return;
        }
        log.info("The newest backup is older than 24 hours: a make-up backup runs in {} minutes", DELAY.toMinutes());
        scheduler.schedule(this::run, clock.instant().plus(DELAY));
    }

    private void run() {
        if (!overdue()) {
            return;
        }
        if (service.start()) {
            log.info("Make-up backup started");
        } else {
            log.info("Make-up backup skipped: a backup is already running");
        }
    }

    private boolean overdue() {
        Instant newest = service.newestBackupAt();
        return newest == null || newest.isBefore(clock.instant().minus(MAX_AGE));
    }
}
