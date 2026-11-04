package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.subtitlestudio.config.SubtitleStudioProperties;
import com.subtitlestudio.test.MutableClock;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PublishServiceTest {

    private static final Instant NOW = Instant.parse("2026-11-04T10:00:00Z");

    @TempDir
    Path dataDir;

    private final SiteExporter exporter = mock(SiteExporter.class);
    private final PublicSiteBundle bundle = mock(PublicSiteBundle.class);
    private final WranglerClient wrangler = mock(WranglerClient.class);
    private final MutableClock clock = new MutableClock(NOW);
    private final HoldingExecutor executor = new HoldingExecutor();

    /** Holds submitted work until {@link #runPending()}. */
    static class HoldingExecutor implements Executor {
        final List<Runnable> pending = new ArrayList<>();

        @Override
        public void execute(Runnable command) {
            pending.add(command);
        }

        void runPending() {
            List<Runnable> work = new ArrayList<>(pending);
            pending.clear();
            work.forEach(Runnable::run);
        }
    }

    private PublishService service(String token, boolean indexable) {
        var props = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir,
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3, List.of()),
                new SubtitleStudioProperties.Publish(token, "acc", "fans", indexable, "wrangler", Duration.ofMinutes(5)));
        return new PublishService(exporter, bundle, wrangler, props, clock, executor);
    }

    private PublishService service() {
        return service("cf-secret-123", false);
    }

    private static long filesUnder(Path dir) throws IOException {
        if (!Files.exists(dir)) {
            return 0;
        }
        try (Stream<Path> all = Files.walk(dir)) {
            return all.filter(Files::isRegularFile).count();
        }
    }

    @Test
    void notConfiguredRefusesToStart() {
        PublishService s = service("", false);

        assertThatThrownBy(s::start).isInstanceOf(PublishNotConfiguredException.class);
        assertThat(s.status().configured()).isFalse();
        assertThat(s.status().url()).isNull();
    }

    @Test
    void startsAndReportsPublishing() {
        PublishService s = service();

        PublishStatus started = s.start();

        assertThat(started.status()).isEqualTo("PUBLISHING");
        assertThat(s.status().status()).isEqualTo("PUBLISHING");
        assertThat(s.status().url()).isEqualTo("https://fans.pages.dev");
    }

    @Test
    void rejectsSecondStartWhilePublishing() {
        PublishService s = service();
        s.start();

        assertThatThrownBy(s::start).isInstanceOf(PublishInProgressException.class);
        assertThat(executor.pending).hasSize(1);
    }

    @Test
    void successMarksDoneWithTime() {
        PublishService s = service();
        s.start();
        clock.advance(Duration.ofSeconds(30));

        executor.runPending();

        PublishStatus st = s.status();
        assertThat(st.status()).isEqualTo("DONE");
        assertThat(st.lastPublishedAt()).isEqualTo(NOW.plusSeconds(30));
        assertThat(st.error()).isNull();
        verify(exporter).export(any(Path.class), eq(NOW.plusSeconds(30)));
    }

    @Test
    void wranglerFailureMarksFailedWithMessage() {
        doThrow(new PublishFailedException("Cloudflare rejected the API token.")).when(wrangler).deploy(any());
        PublishService s = service();
        s.start();

        executor.runPending();

        assertThat(s.status().status()).isEqualTo("FAILED");
        assertThat(s.status().error()).isEqualTo("Cloudflare rejected the API token.");
        assertThat(s.status().lastPublishedAt()).isNull();
    }

    @Test
    void unexpectedErrorMarksFailedGeneric() {
        doThrow(new IllegalStateException("boom")).when(bundle).writeTo(any(), anyBoolean());
        PublishService s = service();
        s.start();

        executor.runPending();

        assertThat(s.status().status()).isEqualTo("FAILED");
        assertThat(s.status().error()).isEqualTo("Could not publish: IllegalStateException.");
    }

    @Test
    void passesIndexableToBundle() {
        PublishService s = service("cf-secret-123", true);
        s.start();

        executor.runPending();

        verify(bundle).writeTo(any(Path.class), eq(true));
    }

    @Test
    void alwaysDeletesTempDir() throws IOException {
        AtomicReference<Path> used = new AtomicReference<>();
        doAnswer(inv -> {
            Path dir = inv.getArgument(0);
            used.set(dir);
            Files.createDirectories(dir.resolve("data"));
            Files.writeString(dir.resolve("data/site.json"), "{}");
            return null;
        }).when(exporter).export(any(), any());
        PublishService s = service();

        s.start();
        executor.runPending();
        assertThat(used.get()).startsWithRaw(dataDir.resolve("publish-tmp")).doesNotExist();

        doThrow(new PublishFailedException("x")).when(wrangler).deploy(any());
        s.start();
        executor.runPending();
        assertThat(used.get()).doesNotExist();
        assertThat(filesUnder(dataDir.resolve("publish-tmp"))).isZero();
    }

    @Test
    void cleansLeftoverTempDirsOnStartup() throws IOException {
        Path leftover = dataDir.resolve("publish-tmp/old/data/videos.json");
        Files.createDirectories(leftover.getParent());
        Files.writeString(leftover, "[]");

        service().cleanUpLeftovers();

        assertThat(dataDir.resolve("publish-tmp")).doesNotExist();
    }

    @Test
    void canPublishAgainAfterFailure() {
        doThrow(new PublishFailedException("x")).when(wrangler).deploy(any());
        PublishService s = service();
        s.start();
        executor.runPending();

        assertThat(s.start().status()).isEqualTo("PUBLISHING");
        assertThat(s.status().error()).isNull();
    }
}
