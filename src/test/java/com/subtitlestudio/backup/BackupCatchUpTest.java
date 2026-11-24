package com.subtitlestudio.backup;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.subtitlestudio.config.SubtitleStudioProperties;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.scheduling.TaskScheduler;

class BackupCatchUpTest {

    private static final Instant NOW = Instant.parse("2026-11-18T05:00:00Z");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private BackupService service;
    private TaskScheduler scheduler;

    @BeforeEach
    void setUp() {
        service = mock(BackupService.class);
        scheduler = mock(TaskScheduler.class);
    }

    private BackupCatchUp catchUp(String cron) {
        var properties = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), Path.of("data"),
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3,
                        List.of()),
                new SubtitleStudioProperties.Publish("", "", "", false, "wrangler", Duration.ofMinutes(5)),
                null, new SubtitleStudioProperties.Backup(cron));
        return new BackupCatchUp(service, properties, clock, scheduler);
    }

    private Runnable scheduledTask(Instant expectedStart) {
        var task = ArgumentCaptor.forClass(Runnable.class);
        var when = ArgumentCaptor.forClass(Instant.class);
        verify(scheduler).schedule(task.capture(), when.capture());
        assertThat(when.getValue()).isEqualTo(expectedStart);
        return task.getValue();
    }

    @Test
    void waitsTwoMinutesThenRunsOneBackupWhenTheNewestIsOlderThan24Hours() {
        when(service.newestBackupAt()).thenReturn(NOW.minus(Duration.ofHours(25)));
        when(service.start()).thenReturn(true);

        catchUp("0 0 12 * * *").onReady();

        verify(service, never()).start(); // not before the delay: Oracle may not be ready yet
        scheduledTask(NOW.plus(Duration.ofMinutes(2))).run();
        verify(service).start();
    }

    @Test
    void runsWhenThereIsNoBackupAtAll() {
        when(service.newestBackupAt()).thenReturn(null);

        catchUp("0 0 12 * * *").onReady();

        scheduledTask(NOW.plus(Duration.ofMinutes(2)));
    }

    @Test
    void doesNothingWhenTheNewestBackupIsLessThan24HoursOld() {
        when(service.newestBackupAt()).thenReturn(NOW.minus(Duration.ofHours(23)));

        catchUp("0 0 12 * * *").onReady();

        verify(scheduler, never()).schedule(any(Runnable.class), any(Instant.class));
    }

    @Test
    void doesNothingWhenTheDailyBackupIsOff() {
        when(service.newestBackupAt()).thenReturn(null);

        catchUp("").onReady();
        catchUp("not a cron").onReady();

        verify(scheduler, never()).schedule(any(Runnable.class), any(Instant.class));
    }

    @Test
    void skipsWhenABackupWasMadeDuringTheDelay() {
        when(service.newestBackupAt()).thenReturn(null, NOW.minus(Duration.ofMinutes(1)));

        catchUp("0 0 12 * * *").onReady();
        scheduledTask(NOW.plus(Duration.ofMinutes(2))).run();

        verify(service, never()).start();
    }

    @Test
    void doesNotThrowWhenABackupIsAlreadyRunning() {
        when(service.newestBackupAt()).thenReturn(null);
        when(service.start()).thenReturn(false);

        catchUp("0 0 12 * * *").onReady();
        scheduledTask(NOW.plus(Duration.ofMinutes(2))).run();

        verify(service).start();
    }
}
