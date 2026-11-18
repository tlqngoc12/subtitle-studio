package com.subtitlestudio.backup;

import com.subtitlestudio.config.SubtitleStudioProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.scheduling.support.CronTrigger;

/**
 * Runs {@link BackupService#start()} on {@code subtitle-studio.backup.cron} (Vietnam time). A blank cron means no
 * daily run. When a manual run is going at that moment the daily one is skipped, like a second click would be.
 */
@Configuration
@EnableScheduling
public class BackupSchedule implements SchedulingConfigurer {

    private static final Logger log = LoggerFactory.getLogger(BackupSchedule.class);

    private final BackupService service;
    private final String cron;

    public BackupSchedule(BackupService service, SubtitleStudioProperties properties) {
        this.service = service;
        this.cron = properties.backup().cron();
    }

    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        if (cron.isBlank()) {
            log.info("Daily backup is off (subtitle-studio.backup.cron is blank)");
            return;
        }
        if (!CronExpression.isValidExpression(cron)) {
            log.warn("Daily backup is off: subtitle-studio.backup.cron is not a valid cron expression");
            return;
        }
        registrar.addTriggerTask(() -> {
            if (!service.start()) {
                log.info("Daily backup skipped: a backup is already running");
            }
        }, new CronTrigger(cron, BackupLog.ZONE));
    }
}
