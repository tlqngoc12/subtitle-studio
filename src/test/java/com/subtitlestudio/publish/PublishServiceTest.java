package com.subtitlestudio.publish;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
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
        return service(token, indexable, "");
    }

    private PublishService service(String token, boolean indexable, String d1Id) {
        var props = new SubtitleStudioProperties(
                new SubtitleStudioProperties.Ytdlp("yt-dlp", Duration.ofSeconds(60)), dataDir,
                new SubtitleStudioProperties.Gemini("", "m", Duration.ofMinutes(3), Duration.ofMinutes(60), 0.3, List.of()),
                new SubtitleStudioProperties.Publish(token, "acc", "fans", indexable, "wrangler", Duration.ofMinutes(5), d1Id));
        return new PublishService(exporter, bundle, wrangler, new ReadCountsFunctions(props), props, clock, executor);
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

    @Test
    void deployFindsFunctionsAndConfigBesideTheSiteWhenD1IsSet() {
        AtomicReference<String> toml = new AtomicReference<>();
        AtomicReference<Boolean> hasFunctions = new AtomicReference<>();
        doAnswer(inv -> {
            Path site = inv.getArgument(0);
            Path root = site.toAbsolutePath().getParent();
            hasFunctions.set(Files.exists(root.resolve("functions/api/reads/index.js"))
                    && Files.exists(root.resolve("functions/api/reads/[slug].js")));
            toml.set(Files.readString(root.resolve("wrangler.toml")));
            return null;
        }).when(wrangler).deploy(any());
        PublishService s = service("cf-secret-123", false, "d1-id-123");

        s.start();
        executor.runPending();

        assertThat(s.status().status()).isEqualTo("DONE");
        assertThat(hasFunctions.get()).isTrue();
        assertThat(toml.get()).contains("name = \"fans\"", "binding = \"READS\"", "database_id = \"d1-id-123\"")
                .doesNotContain("cf-secret-123");
        // nothing is left in the shared parent directory for the next publish
        assertThat(dataDir.resolve("publish-tmp/functions")).doesNotExist();
        assertThat(dataDir.resolve("publish-tmp/wrangler.toml")).doesNotExist();
    }

    @Test
    void deployHasNoFunctionsWithoutD1AndStaleOnesAreRemoved() throws IOException {
        Path root = dataDir.resolve("publish-tmp");
        Files.createDirectories(root.resolve("functions/api"));
        Files.writeString(root.resolve("functions/api/old.js"), "x");
        Files.writeString(root.resolve("wrangler.toml"), "stale");
        AtomicReference<Boolean> found = new AtomicReference<>();
        doAnswer(inv -> {
            Path parent = ((Path) inv.getArgument(0)).toAbsolutePath().getParent();
            found.set(Files.exists(parent.resolve("functions")) || Files.exists(parent.resolve("wrangler.toml")));
            return null;
        }).when(wrangler).deploy(any());
        PublishService s = service();

        s.start();
        executor.runPending();

        assertThat(found.get()).isFalse();
    }

    private void exporterWritesFiles(int count) {
        doAnswer(inv -> {
            Path dir = inv.getArgument(0);
            Files.createDirectories(dir.resolve("img"));
            for (int i = 0; i < count; i++) {
                Files.createFile(dir.resolve("img/" + i));
            }
            return null;
        }).when(exporter).export(any(), any());
    }

    @Test
    void stopsBeforeDeployOverTheFileLimit() {
        exporterWritesFiles(20_001);
        PublishService s = service();
        s.start();

        executor.runPending();

        PublishStatus st = s.status();
        assertThat(st.status()).isEqualTo("FAILED");
        assertThat(st.error()).isEqualTo(
                "Site has 20001 files, over the 20,000 file limit of Cloudflare Pages (Free plan).");
        assertThat(st.fileCount()).isEqualTo(20_001);
        verify(wrangler, never()).deploy(any());
    }

    @Test
    void recordsTheFileCountOnSuccess() {
        exporterWritesFiles(7);
        PublishService s = service();
        assertThat(s.status().fileCount()).isNull();
        s.start();

        executor.runPending();

        assertThat(s.status().status()).isEqualTo("DONE");
        assertThat(s.status().fileCount()).isEqualTo(7);
        verify(wrangler).deploy(any());
    }
}
